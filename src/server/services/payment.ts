import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { AppError, badRequest, conflict, notFound } from "@/server/errors";
import {
  cashfreeEnv,
  createCashfreeOrder,
  createCashfreeRefund,
  fetchCashfreeOrder,
  fetchCashfreePayments,
  fetchCashfreeRefund,
  isCashfreeLive,
  toPaise,
  verifyCashfreeWebhook,
} from "@/server/integrations/cashfree";
import type { Prisma } from "@/generated/prisma/client";
import { formatINR } from "@/lib/money";
import { audit } from "./audit";
import { notifyAdmins, notifyCustomer } from "./notification";
import { getSettings } from "./settings";
import type { OrderActor } from "./order";

/** Sandbox payments (CASHFREE_MOCK, or legacy RAZORPAY_MOCK seed data) never touch the real gateway. */
const isMockPayment = (p: { provider: string }) => p.provider.endsWith("_MOCK");

export interface CheckoutOptions {
  /** "live" opens Cashfree Checkout; "sandbox" opens the in-app simulated gateway. */
  mode: "live" | "sandbox";
  cashfreeMode: "sandbox" | "production";
  paymentSessionId: string;
  gatewayOrderId: string;
  amount: number;
  currency: "INR";
  orderNumber: string;
  name: string;
}

/** Create (or reuse) the Cashfree order for a PAYMENT_PENDING order and return what the browser needs to open checkout. */
export async function startPayment(orderId: string, customerId: string): Promise<CheckoutOptions> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { payments: { orderBy: { createdAt: "desc" } }, customer: { include: { user: true } } },
  });
  if (!order || order.customerId !== customerId) throw notFound("Order");
  if (order.status !== "PAYMENT_PENDING") throw conflict("This order does not need payment");
  const live = isCashfreeLive();
  const settings = await getSettings();
  const options = (gatewayOrderId: string, paymentSessionId: string): CheckoutOptions => ({
    mode: live ? "live" : "sandbox",
    cashfreeMode: cashfreeEnv(),
    paymentSessionId,
    gatewayOrderId,
    amount: order.total,
    currency: "INR",
    orderNumber: order.orderNumber,
    name: settings.platform.name,
  });

  let payment = order.payments.find((p) => p.status === "PENDING") ?? null;
  // Reuse a still-open gateway order so re-opening checkout never creates a second chargeable order.
  if (payment?.providerOrderId) {
    const sameMode = live !== isMockPayment(payment);
    if (sameMode && !live) return options(payment.providerOrderId, "session_MOCK");
    if (sameMode && live) {
      const cf = await fetchCashfreeOrder(payment.providerOrderId).catch(() => null);
      if (cf?.order_status === "PAID") {
        await syncPaymentFromGateway(payment.id);
        throw conflict("This order is already paid");
      }
      if (cf?.order_status === "ACTIVE") return options(payment.providerOrderId, cf.payment_session_id);
    }
    await db.payment.update({ where: { id: payment.id }, data: { status: "FAILED", failureReason: "Payment session expired" } });
    payment = null;
  }
  if (!payment) {
    payment = await db.payment.create({
      data: { orderId, provider: live ? "CASHFREE" : "CASHFREE_MOCK", method: order.paymentMethod, amount: order.total },
    });
  } else if (payment.provider !== (live ? "CASHFREE" : "CASHFREE_MOCK")) {
    payment = await db.payment.update({ where: { id: payment.id }, data: { provider: live ? "CASHFREE" : "CASHFREE_MOCK" } });
  }

  const appUrl = env().APP_URL.replace(/\/$/, "");
  // 3–45 chars of [A-Za-z0-9_-]; the random suffix makes each attempt a fresh gateway order.
  const gatewayOrderId = `${live ? "" : "MOCK_"}${order.orderNumber}_${randomBytes(3).toString("hex")}`;
  const user = order.customer.user;
  const cf = await createCashfreeOrder({
    orderId: gatewayOrderId,
    amountPaise: order.total,
    customer: { id: order.customerId, phone: user.phone ?? "", name: user.name, email: user.email },
    returnUrl: `${appUrl}/orders/${order.id}?payment=return`,
    notifyUrl: appUrl.startsWith("https://") ? `${appUrl}/api/v1/webhooks/cashfree` : undefined,
    note: `Order ${order.orderNumber}`,
  });
  await db.payment.update({ where: { id: payment.id }, data: { providerOrderId: gatewayOrderId } });
  return options(gatewayOrderId, cf.payment_session_id);
}

export type PaymentOutcome = "paid" | "failed" | "pending";

/**
 * Asks Cashfree for the real state of a payment (never trusts the browser) and records it.
 * Safe to call repeatedly; webhooks reach the same end state independently.
 */
export async function syncPaymentFromGateway(paymentId: string): Promise<PaymentOutcome> {
  const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  if (payment.status === "CAPTURED" || payment.status === "REFUNDED" || payment.status === "PARTIALLY_REFUNDED") return "paid";
  if (!payment.providerOrderId) return "pending";
  const cf = await fetchCashfreeOrder(payment.providerOrderId);
  if (toPaise(cf.order_amount) !== payment.amount) {
    await markPaymentFailed(payment.id, "Gateway amount does not match order");
    throw new AppError(400, "PAYMENT_MISMATCH", "Payment does not match this order");
  }
  const attempts = await fetchCashfreePayments(payment.providerOrderId);
  if (cf.order_status === "PAID") {
    const ok = attempts.find((a) => a.payment_status === "SUCCESS");
    await markPaymentCaptured(payment.id, String(ok?.cf_payment_id ?? cf.cf_order_id), ok?.payment_group ?? null, {
      order: cf,
      payment: ok ?? null,
    } as unknown as Prisma.InputJsonValue);
    return "paid";
  }
  if (attempts.some((a) => a.payment_status === "PENDING")) return "pending";
  const failed = attempts.find((a) => a.payment_status === "FAILED");
  if (failed) {
    await markPaymentFailed(payment.id, failed.payment_message ?? "Payment failed");
    return "failed";
  }
  return "pending"; // not attempted, or the customer closed checkout
}

export interface VerifyInput {
  orderId: string;
  gatewayOrderId?: string;
  /** sandbox only */
  sandboxOutcome?: "success" | "failure";
}

/** Called by the browser after checkout closes (or on return from the gateway). Status always comes from the server/gateway. */
export async function verifyPayment(customerId: string, input: VerifyInput) {
  const order = await db.order.findUnique({ where: { id: input.orderId }, include: { payments: { orderBy: { createdAt: "desc" } } } });
  if (!order || order.customerId !== customerId) throw notFound("Order");
  const payment = input.gatewayOrderId
    ? order.payments.find((p) => p.providerOrderId === input.gatewayOrderId)
    : order.payments.find((p) => p.provider !== "COD" && p.providerOrderId);
  if (!payment) throw notFound("Payment");

  let outcome: PaymentOutcome;
  if (!isMockPayment(payment)) {
    outcome = await syncPaymentFromGateway(payment.id);
  } else if (payment.status === "CAPTURED") {
    outcome = "paid";
  } else if (!input.sandboxOutcome) {
    outcome = "pending";
  } else {
    if (isCashfreeLive()) throw badRequest("Sandbox payments are disabled");
    if (input.sandboxOutcome === "failure") {
      await markPaymentFailed(payment.id, "Sandbox: payment declined by tester");
      outcome = "failed";
    } else {
      await markPaymentCaptured(payment.id, `cf_MOCK${randomBytes(6).toString("hex")}`, "upi", { sandbox: true });
      outcome = "paid";
    }
  }
  const o = await db.order.findUniqueOrThrow({ where: { id: order.id }, select: { id: true, status: true, paymentStatus: true } });
  return { ...o, outcome };
}

/** Idempotent: safe to call from both the checkout callback and the webhook. */
export async function markPaymentCaptured(paymentId: string, providerPaymentId: string, providerMethod: string | null, raw: Prisma.InputJsonValue) {
  const { transitionOrder, SYSTEM, announceNewOrder } = await import("./order");
  const updated = await db.payment.updateMany({
    where: { id: paymentId, status: { in: ["PENDING", "FAILED", "AUTHORIZED"] } },
    data: { status: "CAPTURED", providerPaymentId, providerMethod, capturedAt: new Date(), raw, failureReason: null },
  });
  if (updated.count === 0) return; // already captured
  const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { order: true } });
  await db.order.update({ where: { id: payment.orderId }, data: { paymentStatus: "CAPTURED" } });

  if (payment.order.status === "PAYMENT_PENDING") {
    await transitionOrder(payment.orderId, "PAYMENT_CONFIRMED", SYSTEM, { remarks: `Payment ${providerPaymentId}`, silent: true });
    await transitionOrder(payment.orderId, "SHOP_PENDING", SYSTEM, { remarks: "Sent to shop", silent: true });
    await notifyCustomer(payment.order.customerId, {
      type: "PAYMENT_CONFIRMED",
      title: "Payment confirmed",
      body: `We received ${formatINR(payment.amount)} for order ${payment.order.orderNumber}.`,
      link: `/orders/${payment.orderId}`,
    });
    await announceNewOrder(payment.orderId);
  } else if (payment.order.status === "CANCELLED") {
    // Payment landed after the order was cancelled (e.g. timeout) — refund automatically.
    await initiateRefund(payment.orderId, { amount: payment.amount, reason: "Payment received for a cancelled order", actor: SYSTEM });
  }
  await audit({ id: null, role: "SYSTEM" }, "payment.captured", "Payment", paymentId, { after: { providerPaymentId } });
}

export async function markPaymentFailed(paymentId: string, reason: string) {
  const p = await db.payment.findUnique({ where: { id: paymentId }, include: { order: true } });
  if (!p || p.status === "CAPTURED") return;
  await db.payment.update({ where: { id: paymentId }, data: { status: "FAILED", failureReason: reason } });
  await db.order.update({ where: { id: p.orderId }, data: { paymentStatus: "FAILED" } });
  await notifyCustomer(p.order.customerId, {
    type: "PAYMENT_FAILED",
    title: "Payment failed",
    body: `Payment for order ${p.order.orderNumber} failed. You can retry from the order page.`,
    link: `/orders/${p.orderId}`,
  });
}

// ───────────────────────────── Refunds ─────────────────────────────

export async function initiateRefund(
  orderId: string,
  opts: { amount: number; reason: string; actor: OrderActor; partial?: boolean },
) {
  const { transitionOrder } = await import("./order");
  const order = await db.order.findUnique({ where: { id: orderId }, include: { payments: true, refunds: true } });
  if (!order) throw notFound("Order");
  const payment = order.payments.find((p) => p.status === "CAPTURED" || p.status === "PARTIALLY_REFUNDED");
  if (!payment || payment.provider === "COD" || !payment.providerOrderId) throw badRequest("No online payment to refund");
  const alreadyRefunded = order.refunds.filter((r) => r.status !== "FAILED").reduce((s, r) => s + r.amount, 0);
  const refundable = payment.amount - alreadyRefunded;
  if (opts.amount <= 0 || opts.amount > refundable) throw badRequest(`Refund amount must be between ₹0.01 and ${formatINR(refundable)}`);

  const refund = await db.refund.create({
    data: { orderId, paymentId: payment.id, amount: opts.amount, reason: opts.reason, status: "PROCESSING", initiatedById: opts.actor.id },
  });
  if (!opts.partial && ["CANCELLED", "SHOP_REJECTED", "DELIVERY_FAILED", "DELIVERED"].includes(order.status)) {
    await transitionOrder(orderId, "REFUND_PENDING", opts.actor.role === "SUPER_ADMIN" ? opts.actor : { id: null, role: "SYSTEM" }, {
      remarks: `Refund ${formatINR(opts.amount)}: ${opts.reason}`,
      silent: true,
    });
  }
  try {
    // Our refund id is Cashfree's refund_id (and idempotency key); webhooks report back with it.
    await db.refund.update({ where: { id: refund.id }, data: { providerRefundId: refund.id } });
    const r = await createCashfreeRefund(payment.providerOrderId, refund.id, opts.amount, opts.reason, isMockPayment(payment));
    if (r.refund_status === "SUCCESS") await markRefundProcessed(refund.id);
    else if (r.refund_status === "CANCELLED" || r.refund_status === "REJECTED") {
      throw new AppError(502, "REFUND_FAILED", r.status_description ?? "Refund was rejected by Cashfree");
    }
  } catch (e) {
    await db.refund.update({ where: { id: refund.id }, data: { status: "FAILED", failureReason: (e as Error).message } });
    throw e;
  }
  await audit({ id: opts.actor.id, role: opts.actor.role }, "refund.initiate", "Order", orderId, { after: { amount: opts.amount, reason: opts.reason } });
  return db.refund.findUniqueOrThrow({ where: { id: refund.id } });
}

export async function markRefundProcessed(providerRefundId: string) {
  const { transitionOrder, SYSTEM } = await import("./order");
  const r = await db.refund.updateMany({
    where: { providerRefundId, status: { in: ["PENDING", "PROCESSING"] } },
    data: { status: "PROCESSED", processedAt: new Date() },
  });
  if (r.count === 0) return;
  const refund = await db.refund.findUniqueOrThrow({ where: { providerRefundId }, include: { order: { include: { refunds: true } }, payment: true } });
  const total = refund.order.refunds.filter((x) => x.status === "PROCESSED").reduce((s, x) => s + x.amount, 0);
  if (refund.payment) {
    const full = total >= refund.payment.amount;
    await db.payment.update({ where: { id: refund.payment.id }, data: { status: full ? "REFUNDED" : "PARTIALLY_REFUNDED" } });
    await db.order.update({ where: { id: refund.orderId }, data: { paymentStatus: full ? "REFUNDED" : "PARTIALLY_REFUNDED" } });
  }
  if (refund.order.status === "REFUND_PENDING") {
    await transitionOrder(refund.orderId, "REFUNDED", SYSTEM, { remarks: `Refund ${providerRefundId} processed` });
  } else {
    await notifyCustomer(refund.order.customerId, {
      type: "REFUND",
      title: "Refund processed",
      body: `${formatINR(refund.amount)} has been refunded for order ${refund.order.orderNumber}.`,
      link: `/orders/${refund.orderId}`,
    });
  }
}

// ───────────────────────────── Webhook ─────────────────────────────

interface CfWebhook {
  type: string;
  event_time?: string;
  data?: {
    order?: { order_id: string; order_amount?: number };
    payment?: {
      cf_payment_id: string | number;
      payment_status: string;
      payment_amount?: number;
      payment_group?: string | null;
      payment_message?: string | null;
    };
    refund?: { cf_refund_id: string | number; refund_id: string; order_id: string; refund_status: string; status_description?: string };
  };
}

/** Cashfree Dashboard → Developers → Webhooks: payment success / failed / user dropped, and refund status. */
export async function handleCashfreeWebhook(rawBody: string, signature: string | null, timestamp: string | null, idempotencyKey: string | null) {
  const valid = verifyCashfreeWebhook(rawBody, signature, timestamp);
  let body: CfWebhook;
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw badRequest("Invalid JSON");
  }
  const eventId = idempotencyKey ?? createHash("sha256").update(rawBody).digest("hex");
  const existing = await db.webhookEvent.findUnique({ where: { provider_eventId: { provider: "CASHFREE", eventId } } });
  if (existing?.processedAt) return { duplicate: true };
  const ev =
    existing ??
    (await db.webhookEvent.create({
      data: { provider: "CASHFREE", eventId, eventType: body.type ?? "unknown", payload: body as unknown as Prisma.InputJsonValue, signatureValid: valid },
    }));
  if (!valid) {
    await db.webhookEvent.update({ where: { id: ev.id }, data: { error: "Invalid signature" } });
    throw new AppError(401, "INVALID_SIGNATURE", "Invalid webhook signature");
  }
  try {
    const gatewayOrderId = body.data?.order?.order_id;
    const pay = body.data?.payment;
    if (body.type === "PAYMENT_SUCCESS_WEBHOOK" && gatewayOrderId && pay) {
      const p = await db.payment.findUnique({ where: { providerOrderId: gatewayOrderId } });
      if (p) {
        if (pay.payment_amount !== undefined && toPaise(pay.payment_amount) !== p.amount) throw new Error(`Amount mismatch for ${gatewayOrderId}`);
        await markPaymentCaptured(p.id, String(pay.cf_payment_id), pay.payment_group ?? null, body as unknown as Prisma.InputJsonValue);
      }
    } else if (body.type === "PAYMENT_FAILED_WEBHOOK" && gatewayOrderId && pay) {
      const p = await db.payment.findUnique({ where: { providerOrderId: gatewayOrderId } });
      if (p) await markPaymentFailed(p.id, pay.payment_message ?? "Payment failed");
    } else if (body.type === "REFUND_STATUS_WEBHOOK" && body.data?.refund) {
      const r = body.data.refund;
      if (r.refund_status === "SUCCESS") {
        await markRefundProcessed(r.refund_id);
      } else if (r.refund_status === "CANCELLED" || r.refund_status === "REJECTED") {
        await db.refund.updateMany({
          where: { providerRefundId: r.refund_id, status: { in: ["PENDING", "PROCESSING"] } },
          data: { status: "FAILED", failureReason: r.status_description ?? `Refund ${r.refund_status.toLowerCase()} at Cashfree` },
        });
        await notifyAdmins({
          type: "REFUND",
          title: "Refund failed",
          body: `Cashfree refund ${r.refund_id} was ${r.refund_status.toLowerCase()}`,
          link: "/admin/orders?status=REFUND_PENDING",
        });
      }
    }
    // PAYMENT_USER_DROPPED_WEBHOOK and auto-refund events are recorded but need no action.
    await db.webhookEvent.update({ where: { id: ev.id }, data: { processedAt: new Date(), attempts: { increment: 1 }, error: null } });
  } catch (e) {
    await db.webhookEvent.update({ where: { id: ev.id }, data: { attempts: { increment: 1 }, error: (e as Error).message } });
    throw e;
  }
  return { processed: true };
}

/** Cancel orders whose online payment never completed. Called by the maintenance cron. */
export async function expireUnpaidOrders() {
  const { transitionOrder, SYSTEM } = await import("./order");
  const settings = await getSettings();
  const cutoff = new Date(Date.now() - settings.order.paymentTimeoutMinutes * 60_000);
  const stale = await db.order.findMany({
    where: { status: "PAYMENT_PENDING", createdAt: { lt: cutoff } },
    select: { id: true, payments: { where: { status: "PENDING", providerOrderId: { not: null } } } },
  });
  let expired = 0;
  for (const o of stale) {
    try {
      // A webhook may have been missed: ask Cashfree before cancelling an order the customer actually paid.
      let paid = false;
      for (const p of o.payments) {
        if (!isMockPayment(p) && isCashfreeLive()) paid ||= (await syncPaymentFromGateway(p.id)) === "paid";
      }
      if (paid) continue;
      await transitionOrder(o.id, "CANCELLED", SYSTEM, { remarks: "Payment not completed in time", data: { cancelReason: "Payment timeout", cancelledBy: "SYSTEM" } });
      expired++;
    } catch (e) {
      console.warn("[payment] expire failed", o.id, e);
    }
  }
  return expired;
}

/** Re-checks refunds still in flight at Cashfree (safety net for missed webhooks). Called by the maintenance cron. */
export async function reconcileRefunds() {
  if (!isCashfreeLive()) return 0;
  const pending = await db.refund.findMany({
    where: {
      status: { in: ["PENDING", "PROCESSING"] },
      providerRefundId: { not: null },
      createdAt: { lt: new Date(Date.now() - 5 * 60_000) },
      payment: { provider: "CASHFREE", providerOrderId: { not: null } },
    },
    include: { payment: true },
    take: 50,
  });
  let settled = 0;
  for (const r of pending) {
    try {
      const remote = await fetchCashfreeRefund(r.payment!.providerOrderId!, r.providerRefundId!);
      if (remote.refund_status === "SUCCESS") {
        await markRefundProcessed(r.providerRefundId!);
        settled++;
      } else if (remote.refund_status === "CANCELLED" || remote.refund_status === "REJECTED") {
        await db.refund.update({ where: { id: r.id }, data: { status: "FAILED", failureReason: remote.status_description ?? `Refund ${remote.refund_status.toLowerCase()}` } });
        await notifyAdmins({ type: "REFUND", title: "Refund failed", body: `Cashfree refund ${r.providerRefundId} was ${remote.refund_status.toLowerCase()}`, link: "/admin/orders?status=REFUND_PENDING" });
        settled++;
      }
    } catch (e) {
      console.warn("[payment] refund reconcile failed", r.id, e);
    }
  }
  return settled;
}
