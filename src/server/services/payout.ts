import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { badRequest, conflict, notFound } from "@/server/errors";
import type { SessionUser } from "@/server/auth/session";
import { decryptField, encryptField } from "@/server/crypto";
import type { Prisma } from "@/generated/prisma/client";
import { formatINR } from "@/lib/money";
import { audit } from "./audit";
import { notifyAdmins, notifyShop, notifyUsers } from "./notification";

/**
 * Shop payouts. Every delivered order creates a Commission row (gross − platform commission = shopEarning).
 * Unsettled commissions are the shop's available balance. A payout (ShopSettlement) bundles them:
 * the owner requests one (or the admin creates one), the admin transfers the money outside the app and
 * records the UTR / method / receipt. Rejected or cancelled payouts release their orders back to the balance.
 */

const actorOf = (u: SessionUser) => ({ id: u.id, role: u.role });
/** A payout that still holds its orders: waiting for the dealer, waiting for the admin, or being transferred. */
const OPEN_STATUSES = ["DEALER_REVIEW", "PENDING", "PROCESSING"] as const;
export const PAYOUT_METHODS = ["IMPS", "NEFT", "RTGS", "UPI", "OTHER"] as const;

// ───────────────────────────── Bank account ─────────────────────────────

export const zBankInput = z.object({
  accountHolderName: z.string().trim().min(3, "Enter the name exactly as on the bank account").max(100),
  accountNumber: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s/g, ""))
    .pipe(z.string().regex(/^\d{9,18}$/, "Account number must be 9–18 digits")),
  ifsc: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Enter a valid 11-character IFSC, e.g. HDFC0001234")),
  bankName: z.string().trim().max(80).optional().nullable(),
  upiId: z
    .string()
    .trim()
    .max(100)
    .regex(/^[\w.-]{2,}@[a-zA-Z][\w.-]{1,}$/, "Enter a valid UPI ID, e.g. name@okhdfcbank")
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null)),
});
export type BankInput = z.infer<typeof zBankInput>;

export interface BankView {
  accountHolderName: string;
  accountNumberMasked: string;
  accountLast4: string;
  ifsc: string;
  bankName: string | null;
  upiId: string | null;
  updatedAt: Date;
}

type BankRow = Pick<Prisma.ShopBankAccountGetPayload<object>, "accountHolderName" | "accountLast4" | "ifsc" | "bankName" | "upiId" | "updatedAt">;
const mask = (last4: string) => `•••• ${last4}`;
/** Masked view of a shop or dealer bank account. */
export const toView = (b: BankRow): BankView => ({
  accountHolderName: b.accountHolderName,
  accountNumberMasked: mask(b.accountLast4),
  accountLast4: b.accountLast4,
  ifsc: b.ifsc,
  bankName: b.bankName,
  upiId: b.upiId,
  updatedAt: b.updatedAt,
});

export async function getBankAccount(shopId: string): Promise<BankView | null> {
  const b = await db.shopBankAccount.findUnique({ where: { shopId } });
  return b ? toView(b) : null;
}

/** Admin only: full account number for making the transfer. */
export async function revealBankAccount(shopId: string) {
  const b = await db.shopBankAccount.findUnique({ where: { shopId } });
  return b ? { ...toView(b), accountNumber: decryptField(b.accountNumberEnc) } : null;
}

export async function saveBankAccount(actor: SessionUser, shopId: string, input: BankInput) {
  const open = await db.shopSettlement.findFirst({ where: { shopId, status: { in: [...OPEN_STATUSES] } }, select: { id: true } });
  if (open) throw conflict("A payout is in progress. Cancel it or wait until it is paid before changing bank details.");
  const before = await db.shopBankAccount.findUnique({ where: { shopId } });
  const data = {
    accountHolderName: input.accountHolderName,
    accountNumberEnc: encryptField(input.accountNumber),
    accountLast4: input.accountNumber.slice(-4),
    ifsc: input.ifsc,
    bankName: input.bankName || null,
    upiId: input.upiId || null,
    updatedById: actor.id,
  };
  const saved = await db.shopBankAccount.upsert({ where: { shopId }, create: { shopId, ...data }, update: data });
  const view = toView(saved);
  await audit(actorOf(actor), before ? "bank_account.update" : "bank_account.create", "Shop", shopId, {
    before: before ? toView(before) : undefined,
    after: view,
  });
  if (before && actor.role === "SHOP_OWNER") {
    // Security signal: payout destination changed.
    const shop = await db.shop.findUnique({ where: { id: shopId }, select: { name: true } });
    await notifyAdmins({ type: "SHOP", title: "Shop bank details changed", body: `${shop?.name}: now ${view.ifsc} ${view.accountNumberMasked}`, link: `/admin/shops/${shopId}` });
  }
  return view;
}

// ───────────────────────────── Balance ─────────────────────────────

export async function availableBalance(shopId: string) {
  const a = await db.commission.aggregate({
    where: { shopId, settlementId: null },
    _sum: { shopEarning: true, amount: true, baseAmount: true },
    _count: true,
  });
  return { orders: a._count, gross: a._sum.baseAmount ?? 0, commission: a._sum.amount ?? 0, net: a._sum.shopEarning ?? 0 };
}

export async function payoutOverview(shopId: string) {
  const [available, bank, payouts, lifetime] = await Promise.all([
    availableBalance(shopId),
    getBankAccount(shopId),
    db.shopSettlement.findMany({ where: { shopId }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.shopSettlement.aggregate({ where: { shopId, status: "PAID" }, _sum: { netPayable: true } }),
  ]);
  const open = payouts.find((p) => (OPEN_STATUSES as readonly string[]).includes(p.status)) ?? null;
  return { available, bank, open, payouts, paidOut: lifetime._sum.netPayable ?? 0 };
}

// ───────────────────────────── Creating payouts ─────────────────────────────

async function bundle(
  tx: Prisma.TransactionClient,
  shopId: string,
  where: Prisma.CommissionWhereInput,
  meta: { requestedBy: "SHOP" | "ADMIN"; requestedById: string; bank: BankView | null; dealerId?: string | null },
) {
  const commissions = await tx.commission.findMany({ where: { ...where, shopId, settlementId: null }, select: { id: true, baseAmount: true, amount: true, shopEarning: true, createdAt: true } });
  if (!commissions.length) throw badRequest("No delivered orders waiting for payout");
  const net = commissions.reduce((s, c) => s + c.shopEarning, 0);
  if (net <= 0) throw badRequest("Nothing to pay out");
  const times = commissions.map((c) => c.createdAt.getTime());
  const settlement = await tx.shopSettlement.create({
    data: {
      shopId,
      periodStart: new Date(Math.min(...times)),
      periodEnd: new Date(Math.max(...times)),
      orderCount: commissions.length,
      grossSales: commissions.reduce((s, c) => s + c.baseAmount, 0),
      commissionAmount: commissions.reduce((s, c) => s + c.amount, 0),
      netPayable: net,
      requestedBy: meta.requestedBy,
      requestedById: meta.requestedById,
      // Requests from a dealer's shop go to that dealer first; admin-created payouts skip the review.
      status: meta.dealerId ? "DEALER_REVIEW" : "PENDING",
      dealerId: meta.dealerId ?? null,
      bankSnapshot: meta.bank
        ? ({ accountHolderName: meta.bank.accountHolderName, accountLast4: meta.bank.accountLast4, ifsc: meta.bank.ifsc, bankName: meta.bank.bankName, upiId: meta.bank.upiId } as Prisma.InputJsonValue)
        : undefined,
    },
  });
  // Guard against a concurrent payout grabbing the same orders: every row must still be unsettled.
  const claimed = await tx.commission.updateMany({ where: { id: { in: commissions.map((c) => c.id) }, settlementId: null }, data: { settlementId: settlement.id } });
  if (claimed.count !== commissions.length) throw conflict("Balance changed while creating the payout. Please try again.");
  return settlement;
}

/** Shop owner asks for their whole available balance to be transferred. One open request at a time. */
export async function requestPayout(actor: SessionUser, shopId: string) {
  const bank = await getBankAccount(shopId);
  if (!bank) throw badRequest("Add your bank account before requesting a payout");
  const shop = await db.shop.findUnique({ where: { id: shopId }, select: { name: true, dealer: { select: { id: true, userId: true } } } });
  const result = await db.$transaction(async (tx) => {
    // Serialise requests per shop so two taps can't create two open payouts.
    await tx.$executeRaw`SELECT id FROM "Shop" WHERE id = ${shopId} FOR UPDATE`;
    const open = await tx.shopSettlement.findFirst({ where: { shopId, status: { in: [...OPEN_STATUSES] } }, select: { id: true } });
    if (open) throw conflict("You already have a payout request in progress");
    return bundle(tx, shopId, {}, { requestedBy: "SHOP", requestedById: actor.id, bank, dealerId: shop?.dealer?.id });
  });
  await audit(actorOf(actor), "payout.request", "ShopSettlement", result.id, { after: { netPayable: result.netPayable, orders: result.orderCount, status: result.status } });
  const body = `${shop?.name} requested ${formatINR(result.netPayable)} (${result.orderCount} orders)`;
  if (shop?.dealer) await notifyUsers([shop.dealer.userId], { type: "PAYOUT", title: "Payout to review", body, link: "/dealer/payouts" });
  else await notifyAdmins({ type: "PAYOUT", title: "Payout requested", body, link: "/admin/finance" });
  return result;
}

export async function cancelPayout(actor: SessionUser, shopId: string, id: string) {
  const result = await db.$transaction(async (tx) => {
    const s = await tx.shopSettlement.findFirst({ where: { id, shopId } });
    if (!s) throw notFound("Payout");
    if (s.status !== "PENDING" && s.status !== "DEALER_REVIEW") throw conflict("Only a pending request can be cancelled");
    await tx.commission.updateMany({ where: { settlementId: id }, data: { settlementId: null } });
    return tx.shopSettlement.update({ where: { id }, data: { status: "CANCELLED" } });
  });
  await audit(actorOf(actor), "payout.cancel", "ShopSettlement", id);
  return result;
}

/** Admin bundles a shop's unsettled orders in a period (works even if the owner never asked). */
export async function generateSettlement(actor: SessionUser, shopId: string, periodStart: Date, periodEnd: Date) {
  const bank = await getBankAccount(shopId);
  const result = await db.$transaction((tx) =>
    bundle(tx, shopId, { createdAt: { gte: periodStart, lte: periodEnd } }, { requestedBy: "ADMIN", requestedById: actor.id, bank }),
  );
  await audit(actorOf(actor), "settlement.generate", "ShopSettlement", result.id, { after: result });
  return result;
}

// ───────────────────────────── Admin: pay / reject ─────────────────────────────

export const zMarkPaid = z.object({
  reference: z.string().trim().min(3, "Enter the UTR / transaction id").max(80),
  payoutMethod: z.enum(PAYOUT_METHODS).default("IMPS"),
  paidAt: z.coerce.date().optional(),
  proofUrl: z.string().trim().url().max(500).optional().nullable(),
  notes: z.string().trim().max(300).optional().nullable(),
});

export async function markSettlementPaid(actor: SessionUser, id: string, input: z.infer<typeof zMarkPaid>) {
  const s = await db.shopSettlement.findUnique({ where: { id } });
  if (!s) throw notFound("Payout");
  if (s.status === "PAID") throw conflict("Payout already marked as paid");
  if (s.status === "REJECTED" || s.status === "CANCELLED") throw conflict(`Payout was ${s.status.toLowerCase()}`);
  if (s.status === "DEALER_REVIEW") throw conflict("This payout is waiting for the dealer's approval");
  const paidAt = input.paidAt && input.paidAt.getTime() <= Date.now() + 60_000 ? input.paidAt : new Date();
  const updated = await db.shopSettlement.update({
    where: { id, status: s.status },
    data: { status: "PAID", reference: input.reference, payoutMethod: input.payoutMethod, proofUrl: input.proofUrl ?? null, notes: input.notes ?? null, paidAt },
  });
  await audit(actorOf(actor), "settlement.paid", "ShopSettlement", id, { after: { reference: input.reference, payoutMethod: input.payoutMethod, proofUrl: input.proofUrl } });
  await notifyShop(s.shopId, { type: "PAYOUT", title: "Payout sent", body: `${formatINR(s.netPayable)} via ${input.payoutMethod} · Ref ${input.reference}`, link: "/shop/earnings" });
  return updated;
}

export async function rejectPayout(actor: SessionUser, id: string, reason: string) {
  const result = await db.$transaction(async (tx) => {
    const s = await tx.shopSettlement.findUnique({ where: { id } });
    if (!s) throw notFound("Payout");
    if (!(OPEN_STATUSES as readonly string[]).includes(s.status)) throw conflict(`Payout is already ${s.status.toLowerCase()}`);
    await tx.commission.updateMany({ where: { settlementId: id }, data: { settlementId: null } });
    return tx.shopSettlement.update({ where: { id }, data: { status: "REJECTED", rejectionReason: reason } });
  });
  await audit(actorOf(actor), "payout.reject", "ShopSettlement", id, { after: { reason } });
  await notifyShop(result.shopId, { type: "PAYOUT", title: "Payout request declined", body: reason, link: "/shop/earnings" });
  return result;
}
