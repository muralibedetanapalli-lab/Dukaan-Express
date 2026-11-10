import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/server/db";
import { AppError, badRequest, conflict, notFound } from "@/server/errors";
import {
  createRazorpayOrder,
  createRefund,
  fetchPayment,
  isRazorpayLive,
  publicRazorpayKey,
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from "@/server/integrations/razorpay";
import type { Prisma } from "@/generated/prisma/client";
import { formatINR } from "@/lib/money";
import { audit } from "./audit";
import { notifyAdmins, notifyCustomer } from "./notification";
import { getSettings } from "./settings";
import type { OrderActor } from "./order";

const PAYMENT_METHOD_MAP: Record<string, string> = { UPI: "upi", CARD: "card", NETBANKING: "netbanking" };

/** Returns everything the browser needs to open Razorpay Checkout (or the sandbox checkout). */
export async function startPayment(orderId: string, customerId: string) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { payments: { orderBy: { createdAt: "desc" } }, customer: { include: { user: true } } },
  });
  if (!order || order.customerId !== customerId) throw notFound("Order");
  if (order.status !== "PAYMENT_PENDING") throw conflict("This order does not need payment");
  let payment = order.payments.find((p) => p.status === "PENDING" || p.status === "FAILED");
  if (!payment || payment.status === "FAILED") {
    payment = await db.payment.create({
      data: {
        orderId,
        provider: isRazorpayLive() ? "RAZORPAY" : "RAZORPAY_MOCK",
        method: order.paymentMethod,
        amount: order.total,
      },
    });
  }
  if (!payment.providerOrderId) {
    const rzp = await createRazorpayOrder(order.total, `${order.orderNumber}-${randomBytes(2).toString("hex")}`, { orderId });
    payment = await db.payment.update({ where: { id: payment.id }, data: { providerOrderId: rzp.id } });
  }
  const settings = await getSettings();
  return {
    mode: isRazorpayLive() ? "live" : "sandbox",
    keyId: publicRazorpayKey(),
    razorpayOrderId: payment.providerOrderId!,
    amount: order.total,
    currency: "INR",
    orderNumber: order.orderNumber,
    name: settings.platform.name,
    preferredMethod: PAYMENT_METHOD_MAP[order.paymentMethod] ?? null,
    prefill: { name: order.customer.user.name ?? "", contact: order.customer.user.phone ?? "", email: order.customer.user.email ?? "" },
  };
}

export interface VerifyInput {
  orderId: string;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  /** sandbox only */
  sandboxOutcome?: "success" | "failure";
}

export async function verifyPayment(customerId: string, input: VerifyInput) {
  const payment = await db.payment.findUnique({ where: { providerOrderId: input.razorpayOrderId }, include: { order: true } });
  if (!payment || payment.orderId !== input.orderId || payment.order.customerId !== customerId) throw notFound("Payment");

  if (isRazorpayLive()) {
    if (!input.razorpayPaymentId || !input.razorpaySignature) throw badRequest("Missing payment details");
    if (!verifyCheckoutSignature(input.razorpayOrderId, input.razorpayPaymentId, input.razorpaySignature)) {
      await markPaymentFailed(payment.id, "Signature verification failed");
      throw new AppError(400, "SIGNATURE_INVALID", "Payment verification failed");
    }
    // Defence in depth: confirm with Razorpay that the payment is really captured/authorized.
    const remote = await fetchPayment(input.razorpayPaymentId);
    if (remote.order_id !== input.razorpayOrderId || remote.amount !== payment.amount) {
      await markPaymentFailed(payment.id, "Payment does not match order");
      throw new AppError(400, "PAYMENT_MISMATCH", "Payment does not match this order");
    }
    if (remote.status === "failed") {
      await markPaymentFailed(payment.id, remote.error_description ?? "Payment failed");
      throw new AppError(402, "PAYMENT_FAILED", "Payment failed");
    }
    await markPaymentCaptured(payment.id, input.razorpayPaymentId, remote.method, remote as unknown as Prisma.InputJsonValue);
  } else {
    if (payment.provider !== "RAZORPAY_MOCK") throw badRequest("Invalid sandbox payment");
    if (input.sandboxOutcome === "failure") {
      await markPaymentFailed(payment.id, "Sandbox: payment declined by tester");
      throw new AppError(402, "PAYMENT_FAILED", "Payment failed (sandbox)");
    }
    await markPaymentCaptured(payment.id, `pay_MOCK${randomBytes(7).toString("hex")}`, PAYMENT_METHOD_MAP[payment.method] ?? "upi", { sandbox: true });
  }
  return db.order.findUniqueOrThrow({ where: { id: payment.orderId }, select: { id: true, status: true, paymentStatus: true } });
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
  if (!payment || payment.provider === "COD" || !payment.providerPaymentId) throw badRequest("No online payment to refund");
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
    const r = await createRefund(payment.providerPaymentId, opts.amount, { orderId, refundId: refund.id });
    await db.refund.update({ where: { id: refund.id }, data: { providerRefundId: r.id } });
    if (r.status === "processed") await markRefundProcessed(r.id);
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

interface RzpWebhook {
  event: string;
  payload: {
    payment?: { entity: { id: string; order_id: string; method?: string; error_description?: string } };
    refund?: { entity: { id: string; payment_id: string; status: string } };
  };
}

export async function handleRazorpayWebhook(rawBody: string, signature: string | null, eventIdHeader: string | null) {
  const valid = verifyWebhookSignature(rawBody, signature);
  let body: RzpWebhook;
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw badRequest("Invalid JSON");
  }
  const eventId = eventIdHeader ?? createHash("sha256").update(rawBody).digest("hex");
  const existing = await db.webhookEvent.findUnique({ where: { provider_eventId: { provider: "RAZORPAY", eventId } } });
  if (existing?.processedAt) return { duplicate: true };
  const ev =
    existing ??
    (await db.webhookEvent.create({
      data: { provider: "RAZORPAY", eventId, eventType: body.event ?? "unknown", payload: body as unknown as Prisma.InputJsonValue, signatureValid: valid },
    }));
  if (!valid) {
    await db.webhookEvent.update({ where: { id: ev.id }, data: { error: "Invalid signature" } });
    throw new AppError(401, "INVALID_SIGNATURE", "Invalid webhook signature");
  }
  try {
    const pay = body.payload.payment?.entity;
    if ((body.event === "payment.captured" || body.event === "order.paid") && pay) {
      const p = await db.payment.findUnique({ where: { providerOrderId: pay.order_id } });
      if (p) await markPaymentCaptured(p.id, pay.id, pay.method ?? null, body as unknown as Prisma.InputJsonValue);
    } else if (body.event === "payment.failed" && pay) {
      const p = await db.payment.findUnique({ where: { providerOrderId: pay.order_id } });
      if (p) await markPaymentFailed(p.id, pay.error_description ?? "Payment failed");
    } else if (body.event === "refund.processed" && body.payload.refund) {
      await markRefundProcessed(body.payload.refund.entity.id);
    } else if (body.event === "refund.failed" && body.payload.refund) {
      await db.refund.updateMany({
        where: { providerRefundId: body.payload.refund.entity.id },
        data: { status: "FAILED", failureReason: "Refund failed at Razorpay" },
      });
      await notifyAdmins({ type: "REFUND", title: "Refund failed", body: `Razorpay refund ${body.payload.refund.entity.id} failed`, link: "/admin/orders?status=REFUND_PENDING" });
    }
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
  const stale = await db.order.findMany({ where: { status: "PAYMENT_PENDING", createdAt: { lt: cutoff } }, select: { id: true } });
  for (const o of stale) {
    try {
      await transitionOrder(o.id, "CANCELLED", SYSTEM, { remarks: "Payment not completed in time", data: { cancelReason: "Payment timeout", cancelledBy: "SYSTEM" } });
    } catch (e) {
      console.warn("[payment] expire failed", o.id, e);
    }
  }
  return stale.length;
}
