import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { badRequest, conflict, forbidden, notFound } from "@/server/errors";
import { hashPassword, passwordPolicy, temporaryPassword } from "@/server/auth/password";
import type { SessionUser } from "@/server/auth/session";
import { decryptField, encryptField } from "@/server/crypto";
import { zPhone } from "@/server/http";
import type { Prisma } from "@/generated/prisma/client";
import { formatINR } from "@/lib/money";
import { audit } from "./audit";
import { createShop, zShopInput } from "./admin";
import { notifyAdmins, notifyShop, notifyUsers } from "./notification";
import { PAYOUT_METHODS, toView, type BankInput, type BankView } from "./payout";

/**
 * Regional dealers.
 * - The admin creates a dealer and assigns regions (service areas). One dealer per region.
 * - A dealer onboards shops in their regions (shop + owner login, live immediately) and sees only their shops.
 * - Payout requests from a dealer's shops wait in DEALER_REVIEW; the dealer approves (→ PENDING, the admin's
 *   queue) or rejects (orders return to the shop's balance).
 * - On every delivered order of their shops the dealer earns `commissionShareBps` of the platform commission
 *   (Commission.dealerAmount). They request it like shops do; the admin pays and records the UTR.
 */

const actorOf = (u: SessionUser) => ({ id: u.id, role: u.role });
const OPEN = ["PENDING", "PROCESSING"] as const;

// ───────────────────────────── Admin: dealers & regions ─────────────────────────────

export const zDealerInput = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email().transform((e) => e.toLowerCase()),
  phone: zPhone,
  password: z.string().max(100).optional().nullable(),
  commissionShareBps: z.number().int().min(0).max(10_000),
  regionIds: z.array(z.string()).max(50).default([]),
});

export const zDealerUpdate = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: zPhone.optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  commissionShareBps: z.number().int().min(0).max(10_000).optional(),
  regionIds: z.array(z.string()).max(50).optional(),
});

/** Regions held by another dealer can't be given away silently: one dealer per region. */
async function setRegions(tx: Prisma.TransactionClient, dealerId: string, regionIds: string[]) {
  const taken = await tx.serviceArea.findMany({
    where: { id: { in: regionIds }, dealerId: { not: null, notIn: [dealerId] } },
    select: { city: true, dealer: { select: { user: { select: { name: true } } } } },
  });
  if (taken.length) {
    throw conflict(`${taken.map((t) => `${t.city} (${t.dealer?.user.name ?? "another dealer"})`).join(", ")} already has a dealer. Remove it from that dealer first.`);
  }
  await tx.serviceArea.updateMany({ where: { dealerId, id: { notIn: regionIds } }, data: { dealerId: null } });
  if (regionIds.length) await tx.serviceArea.updateMany({ where: { id: { in: regionIds } }, data: { dealerId } });
}

export async function createDealer(actor: SessionUser, input: z.infer<typeof zDealerInput>) {
  const password = input.password || temporaryPassword();
  if (!passwordPolicy.test(password)) throw badRequest(passwordPolicy.message);
  const clash = await db.user.findFirst({ where: { OR: [{ email: input.email }, { phone: input.phone }] } });
  if (clash) throw conflict("A user with this email or phone already exists");
  const passwordHash = await hashPassword(password);
  const dealer = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { role: "DEALER", name: input.name, email: input.email, phone: input.phone, passwordHash, dealer: { create: { commissionShareBps: input.commissionShareBps } } },
      include: { dealer: true },
    });
    await setRegions(tx, user.dealer!.id, input.regionIds);
    return user.dealer!;
  });
  await audit(actorOf(actor), "dealer.create", "Dealer", dealer.id, { after: { name: input.name, email: input.email, share: input.commissionShareBps, regions: input.regionIds } });
  return { id: dealer.id, temporaryPassword: input.password ? null : password };
}

export async function updateDealer(actor: SessionUser, dealerId: string, input: z.infer<typeof zDealerUpdate>) {
  const d = await db.dealer.findUnique({ where: { id: dealerId }, include: { user: true } });
  if (!d) throw notFound("Dealer");
  if (input.phone && input.phone !== d.user.phone) {
    const clash = await db.user.findFirst({ where: { phone: input.phone, NOT: { id: d.userId } } });
    if (clash) throw conflict("This mobile number is already in use");
  }
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: d.userId },
      data: {
        name: input.name,
        phone: input.phone,
        status: input.status,
        // Deactivation signs the dealer out everywhere.
        ...(input.status && input.status !== d.user.status ? { sessionVersion: { increment: 1 } } : {}),
      },
    });
    if (input.commissionShareBps !== undefined) await tx.dealer.update({ where: { id: dealerId }, data: { commissionShareBps: input.commissionShareBps } });
    if (input.regionIds) await setRegions(tx, dealerId, input.regionIds);
  });
  await audit(actorOf(actor), "dealer.update", "Dealer", dealerId, { before: { status: d.user.status, share: d.commissionShareBps }, after: input });
}

/** Admin moves a shop to another dealer (or none). Payouts waiting for review follow the shop. */
export async function assignShopDealer(actor: SessionUser, shopId: string, dealerId: string | null) {
  if (dealerId && !(await db.dealer.findUnique({ where: { id: dealerId } }))) throw notFound("Dealer");
  const before = await db.shop.findUnique({ where: { id: shopId }, select: { dealerId: true, deletedAt: true } });
  if (!before || before.deletedAt) throw notFound("Shop");
  await db.$transaction([
    db.shop.update({ where: { id: shopId }, data: { dealerId } }),
    db.shopSettlement.updateMany({
      where: { shopId, status: "DEALER_REVIEW" },
      data: dealerId ? { dealerId } : { status: "PENDING", dealerId: null },
    }),
  ]);
  await audit(actorOf(actor), "shop.assign_dealer", "Shop", shopId, { before: { dealerId: before.dealerId }, after: { dealerId } });
}

// ───────────────────────────── Dealer: onboarding shops ─────────────────────────────

export const zDealerShopInput = zShopInput.omit({ ownerId: true, commissionBps: true }).extend({
  owner: z.object({
    name: z.string().trim().min(2).max(80),
    email: z.email().transform((e) => e.toLowerCase()),
    phone: zPhone,
    password: z.string().max(100).optional().nullable(),
  }),
});

const norm = (s: string) => s.trim().toLowerCase();

/** A shop is in a region when its pincode is listed there, or (for regions without pincodes) the city matches. */
export function regionFor(regions: { id: string; city: string; pincodes: string[] }[], address: { city: string; pincode: string }) {
  return regions.find((r) => (r.pincodes.length ? r.pincodes.includes(address.pincode) : norm(r.city) === norm(address.city))) ?? null;
}

export async function dealerOnboardShop(actor: SessionUser, input: z.infer<typeof zDealerShopInput>) {
  const dealerId = requireDealer(actor);
  const regions = await db.serviceArea.findMany({ where: { dealerId }, select: { id: true, city: true, pincodes: true } });
  if (!regions.length) throw badRequest("You have no regions assigned yet. Ask the admin to assign one.");
  if (!regionFor(regions, input.address)) {
    throw badRequest(`This address is outside your regions (${regions.map((r) => r.city).join(", ")}). Check the city and pincode.`);
  }
  const password = input.owner.password || temporaryPassword();
  if (!passwordPolicy.test(password)) throw badRequest(passwordPolicy.message);
  const clash = await db.user.findFirst({ where: { OR: [{ email: input.owner.email }, { phone: input.owner.phone }] } });
  if (clash) throw conflict("A user with this owner email or mobile number already exists");

  const owner = await db.user.create({
    data: { role: "SHOP_OWNER", name: input.owner.name, email: input.owner.email, phone: input.owner.phone, passwordHash: await hashPassword(password), shopOwner: { create: {} } },
    include: { shopOwner: true },
  });
  const { owner: _o, ...shopInput } = input;
  const shop = await createShop(actor, { ...shopInput, ownerId: owner.shopOwner!.id, commissionBps: null }, { dealerId, goLive: true });
  await audit(actorOf(actor), "owner.create", "User", owner.id, { after: { name: input.owner.name, email: input.owner.email, shopId: shop.id } });
  const dealerName = actor.name ?? "A dealer";
  await notifyAdmins({ type: "SHOP", title: "New shop onboarded by dealer", body: `${dealerName} onboarded ${shop.name} (${input.address.city})`, link: `/admin/shops/${shop.id}` });
  return { id: shop.id, ownerEmail: input.owner.email, temporaryPassword: input.owner.password ? null : password };
}

export function requireDealer(actor: SessionUser) {
  if (actor.role !== "DEALER" || !actor.dealerId) throw forbidden();
  return actor.dealerId;
}

/** The shop must belong to this dealer. */
export async function dealerShop(actor: SessionUser, shopId: string) {
  const dealerId = requireDealer(actor);
  const shop = await db.shop.findFirst({ where: { id: shopId, dealerId, deletedAt: null } });
  if (!shop) throw notFound("Shop");
  return shop;
}

// ───────────────────────────── Dealer: reviewing shop payouts ─────────────────────────────

export async function reviewShopPayout(actor: SessionUser, id: string, decision: { approve: true; note?: string | null } | { approve: false; reason: string }) {
  const dealerId = requireDealer(actor);
  const result = await db.$transaction(async (tx) => {
    const s = await tx.shopSettlement.findUnique({ where: { id }, include: { shop: { select: { name: true, dealerId: true } } } });
    if (!s || s.shop.dealerId !== dealerId) throw notFound("Payout");
    if (s.status !== "DEALER_REVIEW") throw conflict(`This payout is already ${s.status === "PENDING" ? "approved" : s.status.toLowerCase()}`);
    const common = { dealerId, dealerReviewedAt: new Date(), dealerReviewedById: actor.id };
    if (decision.approve) {
      const updated = await tx.shopSettlement.update({ where: { id, status: "DEALER_REVIEW" }, data: { ...common, status: "PENDING", dealerNote: decision.note || null } });
      return { s: updated, shopName: s.shop.name };
    }
    await tx.commission.updateMany({ where: { settlementId: id }, data: { settlementId: null } });
    const updated = await tx.shopSettlement.update({ where: { id, status: "DEALER_REVIEW" }, data: { ...common, status: "REJECTED", rejectionReason: decision.reason, dealerNote: decision.reason } });
    return { s: updated, shopName: s.shop.name };
  });
  const { s, shopName } = result;
  await audit(actorOf(actor), decision.approve ? "payout.dealer_approve" : "payout.dealer_reject", "ShopSettlement", id, { after: decision });
  if (decision.approve) {
    await notifyAdmins({
      type: "PAYOUT",
      title: "Payout approved by dealer",
      body: `${shopName}: ${formatINR(s.netPayable)} approved by ${actor.name ?? "dealer"} — ready to transfer`,
      link: "/admin/finance",
    });
    await notifyShop(s.shopId, { type: "PAYOUT", title: "Payout approved by your dealer", body: `${formatINR(s.netPayable)} is now with the platform for transfer`, link: "/shop/earnings" });
  } else {
    await notifyShop(s.shopId, { type: "PAYOUT", title: "Payout request declined by your dealer", body: decision.reason, link: "/shop/earnings" });
  }
  return s;
}

// ───────────────────────────── Dealer earnings & payouts ─────────────────────────────

export async function dealerBalance(dealerId: string) {
  const a = await db.commission.aggregate({ where: { dealerId, dealerPayoutId: null, dealerAmount: { gt: 0 } }, _sum: { dealerAmount: true }, _count: true });
  return { orders: a._count, amount: a._sum.dealerAmount ?? 0 };
}

export async function getDealerBank(dealerId: string): Promise<BankView | null> {
  const b = await db.dealerBankAccount.findUnique({ where: { dealerId } });
  return b ? toView(b) : null;
}

export async function revealDealerBank(dealerId: string) {
  const b = await db.dealerBankAccount.findUnique({ where: { dealerId } });
  return b ? { ...toView(b), accountNumber: decryptField(b.accountNumberEnc) } : null;
}

export async function saveDealerBank(actor: SessionUser, input: BankInput) {
  const dealerId = requireDealer(actor);
  const open = await db.dealerPayout.findFirst({ where: { dealerId, status: { in: [...OPEN] } }, select: { id: true } });
  if (open) throw conflict("A payout is in progress. Cancel it or wait until it is paid before changing bank details.");
  const before = await db.dealerBankAccount.findUnique({ where: { dealerId } });
  const data = {
    accountHolderName: input.accountHolderName,
    accountNumberEnc: encryptField(input.accountNumber),
    accountLast4: input.accountNumber.slice(-4),
    ifsc: input.ifsc,
    bankName: input.bankName || null,
    upiId: input.upiId || null,
    updatedById: actor.id,
  };
  const saved = await db.dealerBankAccount.upsert({ where: { dealerId }, create: { dealerId, ...data }, update: data });
  const view = toView(saved);
  await audit(actorOf(actor), before ? "bank_account.update" : "bank_account.create", "Dealer", dealerId, { before: before ? toView(before) : undefined, after: view });
  if (before) await notifyAdmins({ type: "PAYOUT", title: "Dealer bank details changed", body: `${actor.name ?? "Dealer"}: now ${view.ifsc} ${view.accountNumberMasked}`, link: "/admin/dealers" });
  return view;
}

export async function requestDealerPayout(actor: SessionUser) {
  const dealerId = requireDealer(actor);
  const bank = await getDealerBank(dealerId);
  if (!bank) throw badRequest("Add your bank account before requesting a payout");
  const payout = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "Dealer" WHERE id = ${dealerId} FOR UPDATE`;
    const open = await tx.dealerPayout.findFirst({ where: { dealerId, status: { in: [...OPEN] } }, select: { id: true } });
    if (open) throw conflict("You already have a payout request in progress");
    const rows = await tx.commission.findMany({ where: { dealerId, dealerPayoutId: null, dealerAmount: { gt: 0 } }, select: { id: true, dealerAmount: true } });
    if (!rows.length) throw badRequest("No commission waiting for payout yet");
    const p = await tx.dealerPayout.create({
      data: {
        dealerId,
        orderCount: rows.length,
        amount: rows.reduce((s, r) => s + r.dealerAmount, 0),
        requestedById: actor.id,
        bankSnapshot: { accountHolderName: bank.accountHolderName, accountLast4: bank.accountLast4, ifsc: bank.ifsc, bankName: bank.bankName, upiId: bank.upiId } as Prisma.InputJsonValue,
      },
    });
    const claimed = await tx.commission.updateMany({ where: { id: { in: rows.map((r) => r.id) }, dealerPayoutId: null }, data: { dealerPayoutId: p.id } });
    if (claimed.count !== rows.length) throw conflict("Balance changed while creating the payout. Please try again.");
    return p;
  });
  await audit(actorOf(actor), "dealer_payout.request", "DealerPayout", payout.id, { after: { amount: payout.amount, orders: payout.orderCount } });
  await notifyAdmins({ type: "PAYOUT", title: "Dealer payout requested", body: `${actor.name ?? "Dealer"} requested ${formatINR(payout.amount)} commission`, link: "/admin/finance" });
  return payout;
}

export async function cancelDealerPayout(actor: SessionUser, id: string) {
  const dealerId = requireDealer(actor);
  await db.$transaction(async (tx) => {
    const p = await tx.dealerPayout.findFirst({ where: { id, dealerId } });
    if (!p) throw notFound("Payout");
    if (p.status !== "PENDING") throw conflict("Only a pending request can be cancelled");
    await tx.commission.updateMany({ where: { dealerPayoutId: id }, data: { dealerPayoutId: null } });
    await tx.dealerPayout.update({ where: { id }, data: { status: "CANCELLED" } });
  });
  await audit(actorOf(actor), "dealer_payout.cancel", "DealerPayout", id);
}

export const zDealerMarkPaid = z.object({
  reference: z.string().trim().min(3, "Enter the UTR / transaction id").max(80),
  payoutMethod: z.enum(PAYOUT_METHODS).default("IMPS"),
  paidAt: z.coerce.date().optional(),
  proofUrl: z.string().trim().url().max(500).optional().nullable(),
  notes: z.string().trim().max(300).optional().nullable(),
});

export async function markDealerPayoutPaid(actor: SessionUser, id: string, input: z.infer<typeof zDealerMarkPaid>) {
  const p = await db.dealerPayout.findUnique({ where: { id }, include: { dealer: true } });
  if (!p) throw notFound("Payout");
  if (!(OPEN as readonly string[]).includes(p.status)) throw conflict(`Payout is already ${p.status.toLowerCase()}`);
  const paidAt = input.paidAt && input.paidAt.getTime() <= Date.now() + 60_000 ? input.paidAt : new Date();
  const updated = await db.dealerPayout.update({
    where: { id, status: p.status },
    data: { status: "PAID", reference: input.reference, payoutMethod: input.payoutMethod, proofUrl: input.proofUrl ?? null, notes: input.notes ?? null, paidAt },
  });
  await audit(actorOf(actor), "dealer_payout.paid", "DealerPayout", id, { after: { reference: input.reference, payoutMethod: input.payoutMethod } });
  await notifyUsers([p.dealer.userId], { type: "PAYOUT", title: "Commission payout sent", body: `${formatINR(p.amount)} via ${input.payoutMethod} · Ref ${input.reference}`, link: "/dealer/earnings" });
  return updated;
}

export async function rejectDealerPayout(actor: SessionUser, id: string, reason: string) {
  const p = await db.$transaction(async (tx) => {
    const row = await tx.dealerPayout.findUnique({ where: { id }, include: { dealer: true } });
    if (!row) throw notFound("Payout");
    if (!(OPEN as readonly string[]).includes(row.status)) throw conflict(`Payout is already ${row.status.toLowerCase()}`);
    await tx.commission.updateMany({ where: { dealerPayoutId: id }, data: { dealerPayoutId: null } });
    await tx.dealerPayout.update({ where: { id }, data: { status: "REJECTED", rejectionReason: reason } });
    return row;
  });
  await audit(actorOf(actor), "dealer_payout.reject", "DealerPayout", id, { after: { reason } });
  await notifyUsers([p.dealer.userId], { type: "PAYOUT", title: "Commission payout declined", body: reason, link: "/dealer/earnings" });
}
