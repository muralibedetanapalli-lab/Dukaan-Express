import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { handleCashfreeWebhook, verifyPayment, startPayment } from "@/server/services/payment";
import { requestOtp, verifyOtpAndLogin, staffLogin } from "@/server/services/auth";
import { hashPassword } from "@/server/auth/password";
import { signSession, verifySession } from "@/server/auth/jwt";
import { addToCart } from "@/server/services/cart";
import { placeOrder } from "@/server/services/order";
import { fixture, resetDb } from "./helpers";

const sign = (ts: string, body: string) => createHmac("sha256", "test-webhook-secret").update(ts + body).digest("base64");

describe("Cashfree payments & webhooks", () => {
  beforeEach(resetDb);

  it("rejects webhooks with an invalid signature and records them", async () => {
    const body = JSON.stringify({ type: "PAYMENT_SUCCESS_WEBHOOK", data: {} });
    await expect(handleCashfreeWebhook(body, "bad-signature", "1731300000", "evt_1")).rejects.toMatchObject({ status: 401 });
    const ev = await db.webhookEvent.findFirstOrThrow({ where: { eventId: "evt_1" } });
    expect(ev.signatureValid).toBe(false);
    expect(ev.provider).toBe("CASHFREE");
  });

  it("captures a payment from a signed webhook exactly once", async () => {
    const f = await fixture();
    await addToCart(f.customer.customerId, f.inv1.id, 1, false);
    const order = await placeOrder(f.customer, { addressId: f.customer.addressId, paymentMethod: "CARD" });
    const { gatewayOrderId, amount } = await startPayment(order.id, f.customer.customerId);
    const body = JSON.stringify({
      type: "PAYMENT_SUCCESS_WEBHOOK",
      data: {
        order: { order_id: gatewayOrderId, order_amount: amount / 100 },
        payment: { cf_payment_id: 5114910000001, payment_status: "SUCCESS", payment_amount: amount / 100, payment_group: "credit_card" },
      },
    });
    const ts = "1731300000";
    await handleCashfreeWebhook(body, sign(ts, body), ts, null);
    const again = await handleCashfreeWebhook(body, sign(ts, body), ts, null);
    expect(again).toMatchObject({ duplicate: true });
    const o = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { payments: true } });
    expect(o.paymentStatus).toBe("CAPTURED");
    expect(o.status).toBe("SHOP_PENDING");
    expect(o.payments[0].providerPaymentId).toBe("5114910000001");
  });

  it("refuses a webhook whose amount does not match the order", async () => {
    const f = await fixture();
    await addToCart(f.customer.customerId, f.inv1.id, 1, false);
    const order = await placeOrder(f.customer, { addressId: f.customer.addressId, paymentMethod: "UPI" });
    const { gatewayOrderId } = await startPayment(order.id, f.customer.customerId);
    const body = JSON.stringify({
      type: "PAYMENT_SUCCESS_WEBHOOK",
      data: { order: { order_id: gatewayOrderId }, payment: { cf_payment_id: 1, payment_status: "SUCCESS", payment_amount: 1 } },
    });
    await expect(handleCashfreeWebhook(body, sign("1", body), "1", null)).rejects.toThrow(/Amount mismatch/);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PAYMENT_PENDING");
  });

  it("re-opening checkout reuses the open gateway order", async () => {
    const f = await fixture();
    await addToCart(f.customer.customerId, f.inv1.id, 1, false);
    const order = await placeOrder(f.customer, { addressId: f.customer.addressId, paymentMethod: "UPI" });
    const a = await startPayment(order.id, f.customer.customerId);
    const b = await startPayment(order.id, f.customer.customerId);
    expect(b.gatewayOrderId).toBe(a.gatewayOrderId);
    expect(await db.payment.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("a failed sandbox payment keeps the order retryable", async () => {
    const f = await fixture();
    await addToCart(f.customer.customerId, f.inv1.id, 1, false);
    const order = await placeOrder(f.customer, { addressId: f.customer.addressId, paymentMethod: "UPI" });
    const s = await startPayment(order.id, f.customer.customerId);
    const failed = await verifyPayment(f.customer.customerId, { orderId: order.id, gatewayOrderId: s.gatewayOrderId, sandboxOutcome: "failure" });
    expect(failed.outcome).toBe("failed");
    const retry = await startPayment(order.id, f.customer.customerId);
    expect(retry.gatewayOrderId).not.toBe(s.gatewayOrderId);
    const ok = await verifyPayment(f.customer.customerId, { orderId: order.id, gatewayOrderId: retry.gatewayOrderId, sandboxOutcome: "success" });
    expect(ok.outcome).toBe("paid");
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("SHOP_PENDING");
  });
});

describe("authentication", () => {
  beforeEach(resetDb);

  it("OTP login creates a customer once and blocks reuse / brute force", async () => {
    const r = await requestOtp("9876543210");
    expect(r.devOtp).toMatch(/^\d{6}$/);
    await expect(verifyOtpAndLogin("9876543210", "000000")).rejects.toMatchObject({ message: "Incorrect OTP" });
    const { user, isNew } = await verifyOtpAndLogin("9876543210", r.devOtp!);
    expect(isNew).toBe(true);
    expect(user.role).toBe("CUSTOMER");
    await expect(verifyOtpAndLogin("9876543210", r.devOtp!)).rejects.toBeTruthy();
    await expect(requestOtp("9876543210")).rejects.toMatchObject({ status: 429 }); // resend cooldown
  });

  it("staff login checks password, role and status", async () => {
    await db.user.create({ data: { role: "SHOP_OWNER", email: "o@t.in", passwordHash: await hashPassword("Secret123"), shopOwner: { create: {} } } });
    await expect(staffLogin("o@t.in", "wrong", "ip")).rejects.toMatchObject({ status: 401 });
    expect((await staffLogin("O@T.in", "Secret123", "ip")).role).toBe("SHOP_OWNER");
    await db.user.update({ where: { email: "o@t.in" }, data: { status: "INACTIVE" } });
    await expect(staffLogin("o@t.in", "Secret123", "ip")).rejects.toMatchObject({ status: 401 });
  });

  it("session tokens are signed and tamper-evident", async () => {
    const t = await signSession({ sub: "u1", role: "CUSTOMER", sv: 0 }, 1);
    expect((await verifySession(t))?.sub).toBe("u1");
    const [h, p, s] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, "base64url").toString()), role: "SUPER_ADMIN" })).toString("base64url");
    expect(await verifySession(`${h}.${forged}.${s}`)).toBeNull();
  });
});
