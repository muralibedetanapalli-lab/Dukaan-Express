import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { env, integrationModes } from "@/server/env";
import { safeEqual } from "@/server/auth/password";
import { upstream } from "@/server/errors";

/**
 * Cashfree Payment Gateway adapter (PG API, x-api-version 2025-01-01).
 * Live mode talks to sandbox.cashfree.com or api.cashfree.com depending on CASHFREE_ENV;
 * mock mode is an isolated in-app sandbox (ids prefixed `cf_MOCK`) and never calls Cashfree.
 * Amounts in this codebase are integer paise; Cashfree uses rupees with 2 decimals.
 */
const API_VERSION = "2025-01-01";

export const isCashfreeLive = () => integrationModes().cashfree === "live";
export const cashfreeEnv = (): "sandbox" | "production" => (env().CASHFREE_ENV === "production" ? "production" : "sandbox");
const base = () => (cashfreeEnv() === "production" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg");

export const toRupees = (paise: number) => Math.round(paise) / 100;
export const toPaise = (rupees: number) => Math.round(rupees * 100);

async function call<T>(method: "GET" | "POST", path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
  const { CASHFREE_APP_ID, CASHFREE_SECRET_KEY } = env();
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${base()}${path}`, {
        method,
        headers: {
          "x-client-id": CASHFREE_APP_ID!,
          "x-client-secret": CASHFREE_SECRET_KEY!,
          "x-api-version": API_VERSION,
          "content-type": "application/json",
          ...(idempotencyKey ? { "x-idempotency-key": idempotencyKey } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15_000),
      });
      const json = (await res.json().catch(() => ({}))) as T & { message?: string; code?: string };
      if (res.ok) return json;
      if (res.status < 500 && res.status !== 429) throw upstream(`Cashfree: ${json.message ?? res.statusText}`, json);
      lastErr = upstream(`Cashfree ${res.status}`, json);
    } catch (e) {
      lastErr = e;
      if (e instanceof Error && e.name === "AppError") throw e;
    }
    // GETs are safe to retry; POSTs only when they carry an idempotency key.
    if (method !== "GET" && !idempotencyKey) break;
    await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
  }
  throw lastErr instanceof Error ? lastErr : upstream("Cashfree unreachable");
}

export type CfOrderStatus = "ACTIVE" | "PAID" | "EXPIRED" | "TERMINATED" | "TERMINATION_REQUESTED";

export interface CfOrder {
  cf_order_id: string;
  order_id: string;
  order_amount: number;
  order_status: CfOrderStatus;
  payment_session_id: string;
}

export interface CfPayment {
  cf_payment_id: string | number;
  order_id?: string;
  payment_status: "SUCCESS" | "NOT_ATTEMPTED" | "FAILED" | "USER_DROPPED" | "VOID" | "CANCELLED" | "PENDING";
  payment_amount: number;
  payment_group?: string | null;
  payment_message?: string | null;
}

export interface CreateOrderInput {
  orderId: string; // our gateway order id: 3–45 chars, [A-Za-z0-9_-]
  amountPaise: number;
  customer: { id: string; phone: string; name?: string | null; email?: string | null };
  returnUrl: string;
  notifyUrl?: string;
  note?: string;
}

export async function createCashfreeOrder(input: CreateOrderInput): Promise<CfOrder> {
  if (!isCashfreeLive()) {
    return {
      cf_order_id: `cf_MOCK${randomBytes(6).toString("hex")}`,
      order_id: input.orderId,
      order_amount: toRupees(input.amountPaise),
      order_status: "ACTIVE",
      payment_session_id: "session_MOCK",
    };
  }
  return call<CfOrder>(
    "POST",
    "/orders",
    {
      order_id: input.orderId,
      order_amount: toRupees(input.amountPaise),
      order_currency: "INR",
      customer_details: {
        customer_id: input.customer.id,
        customer_phone: input.customer.phone.replace(/^\+91/, ""),
        ...(input.customer.name && input.customer.name.length >= 3 ? { customer_name: input.customer.name } : {}),
        ...(input.customer.email ? { customer_email: input.customer.email } : {}),
      },
      order_meta: { return_url: input.returnUrl, ...(input.notifyUrl ? { notify_url: input.notifyUrl } : {}) },
      ...(input.note ? { order_note: input.note } : {}),
    },
    input.orderId, // same gateway order id → same idempotency key, so retries can't create duplicates
  );
}

export const fetchCashfreeOrder = (orderId: string) => call<CfOrder>("GET", `/orders/${encodeURIComponent(orderId)}`);
export const fetchCashfreePayments = (orderId: string) => call<CfPayment[]>("GET", `/orders/${encodeURIComponent(orderId)}/payments`);

export interface CfRefund {
  cf_refund_id: string | number;
  refund_id: string;
  order_id: string;
  refund_amount: number;
  refund_status: "SUCCESS" | "PENDING" | "PENDING_APPROVAL" | "CANCELLED" | "ONHOLD" | "REJECTED";
  status_description?: string;
}

/** Refunds are created against the gateway order id; `refundId` is ours (3–40 chars) and doubles as the idempotency key. */
export async function createCashfreeRefund(gatewayOrderId: string, refundId: string, amountPaise: number, note: string, mock: boolean): Promise<CfRefund> {
  if (!isCashfreeLive() || mock) {
    return { cf_refund_id: `cf_MOCK${randomBytes(6).toString("hex")}`, refund_id: refundId, order_id: gatewayOrderId, refund_amount: toRupees(amountPaise), refund_status: "SUCCESS" };
  }
  return call<CfRefund>(
    "POST",
    `/orders/${encodeURIComponent(gatewayOrderId)}/refunds`,
    { refund_amount: toRupees(amountPaise), refund_id: refundId, refund_note: note.slice(0, 100).padEnd(3, "."), refund_speed: "STANDARD" },
    refundId,
  );
}

export const fetchCashfreeRefund = (gatewayOrderId: string, refundId: string) =>
  call<CfRefund>("GET", `/orders/${encodeURIComponent(gatewayOrderId)}/refunds/${encodeURIComponent(refundId)}`);

/** Webhook signature: base64(HMAC-SHA256(timestamp + rawBody, secretKey)). */
export function verifyCashfreeWebhook(rawBody: string, signature: string | null, timestamp: string | null) {
  const secret = env().CASHFREE_SECRET_KEY;
  if (!secret || !signature || !timestamp) return false;
  const expected = createHmac("sha256", secret).update(timestamp + rawBody).digest("base64");
  return safeEqual(expected, signature);
}
