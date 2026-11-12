import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { handleCashfreeWebhook, verifyPayment, startPayment } from "@/server/services/payment";
import {
  customerLogin,
  requestOtp,
  resetPassword,
  sendPasswordResetCode,
  sendSignupCode,
  signupCustomer,
  staffLogin,
  verifyOtpAndLogin,
  verifySignupCode,
} from "@/server/services/auth";
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

  it("signup needs a verified email; then login works with email or mobile + password", async () => {
    const base = { name: "Meera", phone: "9812345670", email: "Meera@Example.com", password: "Secret123" };
    // No verification at all → rejected.
    await expect(signupCustomer({ ...base, verificationToken: "not-a-token" }, "ip")).rejects.toMatchObject({ status: 400 });

    const sent = await sendSignupCode(base.email);
    expect(sent.devCode).toMatch(/^\d{6}$/);
    await expect(verifySignupCode(base.email, sent.devCode === "000000" ? "111111" : "000000")).rejects.toMatchObject({ message: "Incorrect code" });
    const { verificationToken } = await verifySignupCode("meera@example.com", sent.devCode!);
    await expect(verifySignupCode(base.email, sent.devCode!)).rejects.toBeTruthy(); // single use

    // A token for one email can't create an account for another, and a session token is never accepted as proof.
    await expect(signupCustomer({ ...base, email: "other@example.com", verificationToken }, "ip")).rejects.toMatchObject({ status: 400 });
    const session = await signSession({ sub: "meera@example.com", role: "CUSTOMER", sv: 0 }, 1);
    await expect(signupCustomer({ ...base, verificationToken: session }, "ip")).rejects.toMatchObject({ status: 400 });
    await expect(signupCustomer({ ...base, password: "short", verificationToken }, "ip")).rejects.toMatchObject({ status: 400 });

    const user = await signupCustomer({ ...base, verificationToken }, "ip");
    expect(user).toMatchObject({ role: "CUSTOMER", email: "meera@example.com", phone: "9812345670" });
    expect(user.emailVerifiedAt).toBeInstanceOf(Date);
    expect(await db.cart.count({ where: { customer: { userId: user.id } } })).toBe(1);

    await expect(sendSignupCode(base.email)).rejects.toMatchObject({ status: 409 }); // already registered

    expect((await customerLogin("MEERA@example.com", "Secret123", "ip")).id).toBe(user.id);
    expect((await customerLogin("+91 98123 45670", "Secret123", "ip")).id).toBe(user.id);
    await expect(customerLogin("meera@example.com", "wrong123", "ip")).rejects.toMatchObject({ status: 401 });

    // Staff accounts can't use the customer login.
    await db.user.create({ data: { role: "SHOP_OWNER", email: "s@t.in", passwordHash: await hashPassword("Secret123"), shopOwner: { create: {} } } });
    await expect(customerLogin("s@t.in", "Secret123", "ip")).rejects.toMatchObject({ status: 400 });
  });

  it("mobile number must be unique at signup", async () => {
    await db.user.create({ data: { role: "CUSTOMER", phone: "9812345670", customer: { create: { cart: { create: {} } } } } });
    const sent = await sendSignupCode("new@example.com");
    const { verificationToken } = await verifySignupCode("new@example.com", sent.devCode!);
    await expect(
      signupCustomer({ name: "New", phone: "9812345670", email: "new@example.com", password: "Secret123", verificationToken }, "ip"),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("password reset by email code signs out old sessions and doesn't reveal unknown emails", async () => {
    const u = await db.user.create({
      data: { role: "CUSTOMER", email: "r@example.com", phone: "9898989898", passwordHash: await hashPassword("OldPass123"), customer: { create: { cart: { create: {} } } } },
    });
    const unknown = await sendPasswordResetCode("nobody@example.com");
    expect(unknown.sent).toBe(true);
    expect(unknown.devCode).toBeUndefined();

    const r = await sendPasswordResetCode("r@example.com");
    await expect(resetPassword("r@example.com", r.devCode!, "weak", "ip")).rejects.toMatchObject({ status: 400 });
    const updated = await resetPassword("r@example.com", r.devCode!, "NewPass123", "ip");
    expect(updated.sessionVersion).toBe(u.sessionVersion + 1);
    await expect(customerLogin("r@example.com", "OldPass123", "ip")).rejects.toMatchObject({ status: 401 });
    expect((await customerLogin("r@example.com", "NewPass123", "ip")).id).toBe(u.id);
    await expect(resetPassword("r@example.com", r.devCode!, "Another123", "ip")).rejects.toBeTruthy(); // single use
  });

  it("session tokens are signed and tamper-evident", async () => {
    const t = await signSession({ sub: "u1", role: "CUSTOMER", sv: 0 }, 1);
    expect((await verifySession(t))?.sub).toBe("u1");
    const [h, p, s] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, "base64url").toString()), role: "SUPER_ADMIN" })).toString("base64url");
    expect(await verifySession(`${h}.${forged}.${s}`)).toBeNull();
  });
});
