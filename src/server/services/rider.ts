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
import { notifyAdmins, notifyUsers } from "./notification";
import { PAYOUT_METHODS, toView, type BankInput, type BankView } from "./payout";
import { requireDealer } from "./dealer";
import { requireRider } from "./delivery";

/**
 * Riders and their wallet.
 * - Dealers onboard riders (the admin can too, picking the dealer).
 * - The wallet is a ledger (RiderWalletEntry): + delivery fees, − cash collected on COD orders,
 *   − money set aside for a withdrawal (returned if the withdrawal is declined or cancelled).
 * - Withdrawal: rider requests → their dealer approves (DEALER_REVIEW → PENDING) → admin transfers and
 *   records the UTR (PAID). Riders without a dealer go straight to the admin.
 */

const actorOf = (u: SessionUser) => ({ id: u.id, role: u.role });
const OPEN = ["DEALER_REVIEW", "PENDING", "PROCESSING"] as const;
export const VEHICLES = ["BIKE", "SCOOTER", "CYCLE", "OTHER"] as const;

// ───────────────────────────── Onboarding ─────────────────────────────

export const zRiderInput = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email().transform((e) => e.toLowerCase()),
  phone: zPhone,
  password: z.string().max(100).optional().nullable(),
  vehicleType: z.enum(VEHICLES).default("BIKE"),
  vehicleNumber: z
    .string()
    .trim()
    .max(20)
    .transform((v) => v.toUpperCase())
    .optional()
    .nullable(),
  dealerId: z.string().optional().nullable(), // admin only
});

export const zRiderUpdate = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: zPhone.optional(),
  vehicleType: z.enum(VEHICLES).optional(),
  vehicleNumber: z.string().trim().max(20).optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  dealerId: z.string().nullable().optional(), // admin only
});

export async function createRider(actor: SessionUser, input: z.infer<typeof zRiderInput>) {
  const dealerId = actor.role === "DEALER" ? requireDealer(actor) : input.dealerId || null;
  if (actor.role !== "DEALER" && actor.role !== "SUPER_ADMIN") throw forbidden();
  if (dealerId && !(await db.dealer.findUnique({ where: { id: dealerId } }))) throw notFound("Dealer");
  const password = input.password || temporaryPassword();
  if (!passwordPolicy.test(password)) throw badRequest(passwordPolicy.message);
  const clash = await db.user.findFirst({ where: { OR: [{ email: input.email }, { phone: input.phone }] } });
  if (clash) throw conflict("A user with this email or mobile number already exists");
  // The rider works in their dealer region (first one if the dealer has several) — used for job offers and leaderboards.
  const area = dealerId ? await db.serviceArea.findFirst({ where: { dealerId }, orderBy: { city: "asc" }, select: { id: true } }) : null;
  const user = await db.user.create({
    data: {
      role: "RIDER",
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash: await hashPassword(password),
      // Added by their dealer or an admin: verified by that person, so no document review is needed.
      rider: { create: { dealerId, serviceAreaId: area?.id ?? null, vehicleType: input.vehicleType, vehicleNumber: input.vehicleNumber || null, kycStatus: "APPROVED", kycReviewedAt: new Date(), kycReviewedById: actor.id } },
    },
    include: { rider: true },
  });
  await audit(actorOf(actor), "rider.create", "Rider", user.rider!.id, { after: { name: input.name, email: input.email, dealerId } });
  return { id: user.rider!.id, temporaryPassword: input.password ? null : password };
}

/** Dealers may only manage their own riders. */
async function managedRider(actor: SessionUser, riderId: string) {
  const r = await db.rider.findUnique({ where: { id: riderId }, include: { user: true } });
  if (!r) throw notFound("Rider");
  if (actor.role === "DEALER" && r.dealerId !== requireDealer(actor)) throw notFound("Rider");
  if (actor.role !== "DEALER" && actor.role !== "SUPER_ADMIN") throw forbidden();
  return r;
}

export async function updateRider(actor: SessionUser, riderId: string, input: z.infer<typeof zRiderUpdate>) {
  const r = await managedRider(actor, riderId);
  if (input.phone && input.phone !== r.user.phone && (await db.user.findFirst({ where: { phone: input.phone, NOT: { id: r.userId } } }))) {
    throw conflict("This mobile number is already in use");
  }
  if (input.status === "INACTIVE" && (await db.shipment.findFirst({ where: { riderId, status: { in: ["COURIER_ASSIGNED", "OUT_FOR_DELIVERY"] } } }))) {
    throw conflict("This rider has a delivery in progress");
  }
  await db.$transaction([
    db.user.update({
      where: { id: r.userId },
      data: { name: input.name, phone: input.phone, status: input.status, ...(input.status && input.status !== r.user.status ? { sessionVersion: { increment: 1 } } : {}) },
    }),
    db.rider.update({
      where: { id: riderId },
      data: {
        vehicleType: input.vehicleType,
        vehicleNumber: input.vehicleNumber === undefined ? undefined : input.vehicleNumber?.toUpperCase() || null,
        ...(input.status === "INACTIVE" ? { isOnline: false } : {}),
        ...(actor.role === "SUPER_ADMIN" && input.dealerId !== undefined ? { dealerId: input.dealerId } : {}),
      },
    }),
  ]);
  await audit(actorOf(actor), "rider.update", "Rider", riderId, { before: { status: r.user.status }, after: input });
}

export async function resetRiderPassword(actor: SessionUser, riderId: string) {
  const r = await managedRider(actor, riderId);
  const password = temporaryPassword();
  await db.user.update({ where: { id: r.userId }, data: { passwordHash: await hashPassword(password), sessionVersion: { increment: 1 } } });
  await audit(actorOf(actor), "user.password_reset", "User", r.userId);
  return { temporaryPassword: password };
}

/** Rider goes online (gets job alerts) or offline. */
export async function setOnline(user: SessionUser, online: boolean) {
  const riderId = requireRider(user);
  if (online) {
    const r = await db.rider.findUniqueOrThrow({ where: { id: riderId }, select: { kycStatus: true } });
    if (r.kycStatus !== "APPROVED") throw badRequest("Your documents must be approved before you can go online");
  }
  if (!online && (await db.shipment.findFirst({ where: { riderId, status: { in: ["COURIER_ASSIGNED", "OUT_FOR_DELIVERY"] } } }))) {
    throw conflict("Finish your current delivery before going offline");
  }
  await db.rider.update({ where: { id: riderId }, data: { isOnline: online } });
  return { online };
}

// ───────────────────────────── Wallet ─────────────────────────────

export async function walletBalance(riderId: string) {
  const a = await db.riderWalletEntry.aggregate({ where: { riderId }, _sum: { amount: true } });
  return a._sum.amount ?? 0;
}

export async function walletSummary(riderId: string) {
  const [balance, earned, cash, entries, withdrawals, bank] = await Promise.all([
    walletBalance(riderId),
    db.riderWalletEntry.aggregate({ where: { riderId, type: "DELIVERY_EARNING" }, _sum: { amount: true }, _count: true }),
    db.riderWalletEntry.aggregate({ where: { riderId, type: "COD_COLLECTED" }, _sum: { amount: true } }),
    db.riderWalletEntry.findMany({ where: { riderId }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.riderWithdrawal.findMany({ where: { riderId }, orderBy: { createdAt: "desc" }, take: 30 }),
    getRiderBank(riderId),
  ]);
  const open = withdrawals.find((w) => (OPEN as readonly string[]).includes(w.status)) ?? null;
  return { balance, earned: earned._sum.amount ?? 0, deliveries: earned._count, cashCollected: -(cash._sum.amount ?? 0), entries, withdrawals, open, bank };
}

// ───────────────────────────── Bank account ─────────────────────────────

export async function getRiderBank(riderId: string): Promise<BankView | null> {
  const b = await db.riderBankAccount.findUnique({ where: { riderId } });
  return b ? toView(b) : null;
}

export async function revealRiderBank(riderId: string) {
  const b = await db.riderBankAccount.findUnique({ where: { riderId } });
  return b ? { ...toView(b), accountNumber: decryptField(b.accountNumberEnc) } : null;
}

export async function saveRiderBank(user: SessionUser, input: BankInput) {
  const riderId = requireRider(user);
  if (await db.riderWithdrawal.findFirst({ where: { riderId, status: { in: [...OPEN] } }, select: { id: true } })) {
    throw conflict("A withdrawal is in progress. Cancel it or wait until it is paid before changing bank details.");
  }
  const before = await db.riderBankAccount.findUnique({ where: { riderId } });
  const data = {
    accountHolderName: input.accountHolderName,
    accountNumberEnc: encryptField(input.accountNumber),
    accountLast4: input.accountNumber.slice(-4),
    ifsc: input.ifsc,
    bankName: input.bankName || null,
    upiId: input.upiId || null,
    updatedById: user.id,
  };
  const saved = await db.riderBankAccount.upsert({ where: { riderId }, create: { riderId, ...data }, update: data });
  const view = toView(saved);
  await audit(actorOf(user), before ? "bank_account.update" : "bank_account.create", "Rider", riderId, { before: before ? toView(before) : undefined, after: view });
  if (before) await notifyAdmins({ type: "PAYOUT", title: "Rider bank details changed", body: `${user.name ?? "Rider"}: now ${view.ifsc} ${view.accountNumberMasked}`, link: "/admin/riders" });
  return view;
}

// ───────────────────────────── Withdrawals ─────────────────────────────

/** Withdraw the whole wallet balance (or a part of it). The amount is set aside immediately. */
export async function requestWithdrawal(user: SessionUser, amount?: number) {
  const riderId = requireRider(user);
  const bank = await getRiderBank(riderId);
  if (!bank) throw badRequest("Add your bank account before withdrawing");
  const rider = await db.rider.findUniqueOrThrow({ where: { id: riderId }, include: { dealer: { select: { id: true, userId: true } } } });
  const w = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "Rider" WHERE id = ${riderId} FOR UPDATE`;
    if (await tx.riderWithdrawal.findFirst({ where: { riderId, status: { in: [...OPEN] } }, select: { id: true } })) {
      throw conflict("You already have a withdrawal in progress");
    }
    const balance = (await tx.riderWalletEntry.aggregate({ where: { riderId }, _sum: { amount: true } }))._sum.amount ?? 0;
    const want = amount ?? balance;
    if (balance <= 0) throw badRequest(balance < 0 ? `You owe ${formatINR(-balance)} in collected cash. Deliver more orders to clear it.` : "Your wallet is empty");
    if (want <= 0 || want > balance) throw badRequest(`You can withdraw up to ${formatINR(balance)}`);
    const created = await tx.riderWithdrawal.create({
      data: {
        riderId,
        amount: want,
        status: rider.dealer ? "DEALER_REVIEW" : "PENDING",
        dealerId: rider.dealer?.id ?? null,
        bankSnapshot: { accountHolderName: bank.accountHolderName, accountLast4: bank.accountLast4, ifsc: bank.ifsc, bankName: bank.bankName, upiId: bank.upiId } as Prisma.InputJsonValue,
      },
    });
    await tx.riderWalletEntry.create({ data: { riderId, type: "WITHDRAWAL", amount: -want, withdrawalId: created.id, note: "Withdrawal requested" } });
    return created;
  });
  await audit(actorOf(user), "rider_withdrawal.request", "RiderWithdrawal", w.id, { after: { amount: w.amount, status: w.status } });
  const body = `${user.name ?? "A rider"} wants to withdraw ${formatINR(w.amount)}`;
  if (rider.dealer) await notifyUsers([rider.dealer.userId], { type: "PAYOUT", title: "Rider withdrawal to approve", body, link: "/dealer/payouts" });
  else await notifyAdmins({ type: "PAYOUT", title: "Rider withdrawal requested", body, link: "/admin/finance" });
  return w;
}

/** Return the money to the wallet and close the withdrawal with the given status. */
async function closeWithRefund(tx: Prisma.TransactionClient, w: { id: string; riderId: string; amount: number }, data: Prisma.RiderWithdrawalUpdateInput, note: string) {
  await tx.riderWithdrawal.update({ where: { id: w.id }, data });
  await tx.riderWalletEntry.create({ data: { riderId: w.riderId, type: "WITHDRAWAL_REVERSAL", amount: w.amount, withdrawalId: w.id, note } });
}

export async function cancelWithdrawal(user: SessionUser, id: string) {
  const riderId = requireRider(user);
  await db.$transaction(async (tx) => {
    const w = await tx.riderWithdrawal.findFirst({ where: { id, riderId } });
    if (!w) throw notFound("Withdrawal");
    if (w.status !== "DEALER_REVIEW" && w.status !== "PENDING") throw conflict("Only a pending request can be cancelled");
    const r = await tx.riderWithdrawal.updateMany({ where: { id, status: w.status }, data: { status: "CANCELLED" } });
    if (r.count !== 1) throw conflict("This withdrawal was just updated");
    await tx.riderWalletEntry.create({ data: { riderId, type: "WITHDRAWAL_REVERSAL", amount: w.amount, withdrawalId: id, note: "Withdrawal cancelled" } });
  });
  await audit(actorOf(user), "rider_withdrawal.cancel", "RiderWithdrawal", id);
}

/** Dealer approves (→ admin) or declines (money back to the wallet) a rider's withdrawal. */
export async function reviewWithdrawal(user: SessionUser, id: string, decision: { approve: true; note?: string | null } | { approve: false; reason: string }) {
  const dealerId = requireDealer(user);
  const w = await db.$transaction(async (tx) => {
    const row = await tx.riderWithdrawal.findUnique({ where: { id }, include: { rider: { select: { dealerId: true, userId: true, user: { select: { name: true } } } } } });
    if (!row || row.rider.dealerId !== dealerId) throw notFound("Withdrawal");
    if (row.status !== "DEALER_REVIEW") throw conflict(`This withdrawal is already ${row.status === "PENDING" ? "approved" : row.status.toLowerCase()}`);
    const common = { dealerId, dealerReviewedAt: new Date(), dealerReviewedById: user.id };
    const claimed = await tx.riderWithdrawal.updateMany({ where: { id, status: "DEALER_REVIEW" }, data: decision.approve ? { ...common, status: "PENDING", dealerNote: decision.note || null } : common });
    if (claimed.count !== 1) throw conflict("This withdrawal was just updated");
    if (!decision.approve) await closeWithRefund(tx, row, { status: "REJECTED", rejectionReason: decision.reason, dealerNote: decision.reason }, "Withdrawal declined by dealer");
    return row;
  });
  await audit(actorOf(user), decision.approve ? "rider_withdrawal.dealer_approve" : "rider_withdrawal.dealer_reject", "RiderWithdrawal", id, { after: decision });
  if (decision.approve) {
    await notifyAdmins({ type: "PAYOUT", title: "Rider withdrawal approved by dealer", body: `${w.rider.user.name}: ${formatINR(w.amount)} approved by ${user.name ?? "dealer"} — ready to transfer`, link: "/admin/finance" });
    await notifyUsers([w.rider.userId], { type: "PAYOUT", title: "Withdrawal approved by your dealer", body: `${formatINR(w.amount)} is with the platform for transfer`, link: "/rider/wallet" });
  } else {
    await notifyUsers([w.rider.userId], { type: "PAYOUT", title: "Withdrawal declined", body: `${decision.reason}. The money is back in your wallet.`, link: "/rider/wallet" });
  }
}

export const zWithdrawalPaid = z.object({
  reference: z.string().trim().min(3, "Enter the UTR / transaction id").max(80),
  payoutMethod: z.enum(PAYOUT_METHODS).default("IMPS"),
  paidAt: z.coerce.date().optional(),
  proofUrl: z.string().trim().url().max(500).optional().nullable(),
  notes: z.string().trim().max(300).optional().nullable(),
});

export async function markWithdrawalPaid(user: SessionUser, id: string, input: z.infer<typeof zWithdrawalPaid>) {
  const w = await db.riderWithdrawal.findUnique({ where: { id }, include: { rider: { select: { userId: true } } } });
  if (!w) throw notFound("Withdrawal");
  if (w.status === "DEALER_REVIEW") throw conflict("This withdrawal is waiting for the dealer's approval");
  if (w.status !== "PENDING" && w.status !== "PROCESSING") throw conflict(`Withdrawal is already ${w.status.toLowerCase()}`);
  const paidAt = input.paidAt && input.paidAt.getTime() <= Date.now() + 60_000 ? input.paidAt : new Date();
  const r = await db.riderWithdrawal.updateMany({
    where: { id, status: w.status },
    data: { status: "PAID", reference: input.reference, payoutMethod: input.payoutMethod, proofUrl: input.proofUrl ?? null, notes: input.notes ?? null, paidAt },
  });
  if (r.count !== 1) throw conflict("This withdrawal was just updated");
  await audit(actorOf(user), "rider_withdrawal.paid", "RiderWithdrawal", id, { after: { reference: input.reference, payoutMethod: input.payoutMethod } });
  await notifyUsers([w.rider.userId], { type: "PAYOUT", title: "Money sent to your bank", body: `${formatINR(w.amount)} via ${input.payoutMethod} · Ref ${input.reference}`, link: "/rider/wallet" });
}

export async function rejectWithdrawal(user: SessionUser, id: string, reason: string) {
  const w = await db.$transaction(async (tx) => {
    const row = await tx.riderWithdrawal.findUnique({ where: { id }, include: { rider: { select: { userId: true } } } });
    if (!row) throw notFound("Withdrawal");
    if (!(OPEN as readonly string[]).includes(row.status)) throw conflict(`Withdrawal is already ${row.status.toLowerCase()}`);
    const r = await tx.riderWithdrawal.updateMany({ where: { id, status: row.status }, data: { status: "REJECTED", rejectionReason: reason } });
    if (r.count !== 1) throw conflict("This withdrawal was just updated");
    await tx.riderWalletEntry.create({ data: { riderId: row.riderId, type: "WITHDRAWAL_REVERSAL", amount: row.amount, withdrawalId: id, note: "Withdrawal declined" } });
    return row;
  });
  await audit(actorOf(user), "rider_withdrawal.reject", "RiderWithdrawal", id, { after: { reason } });
  await notifyUsers([w.rider.userId], { type: "PAYOUT", title: "Withdrawal declined", body: `${reason}. The money is back in your wallet.`, link: "/rider/wallet" });
}
