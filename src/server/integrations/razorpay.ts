import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { env, integrationModes } from "@/server/env";
import { safeEqual } from "@/server/auth/password";
import { upstream } from "@/server/errors";

/**
 * Razorpay adapter. Live mode talks to https://api.razorpay.com/v1 with basic auth;
 * mock mode is an isolated sandbox (ids prefixed `order_MOCK` / `pay_MOCK`) driven by the in-app
 * sandbox checkout. Mock mode never claims to be Razorpay.
 */
const BASE = "https://api.razorpay.com/v1";

export const isRazorpayLive = () => integrationModes().razorpay === "live";

function authHeader() {
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = env();
  return "Basic " + Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64");
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: { Authorization: authHeader(), "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15_000),
      });
      const json = (await res.json().catch(() => ({}))) as T & { error?: { description?: string } };
      if (res.ok) return json;
      if (res.status < 500 && res.status !== 429) {
        throw upstream(`Razorpay: ${json.error?.description ?? res.statusText}`, json);
      }
      lastErr = upstream(`Razorpay ${res.status}`, json);
    } catch (e) {
      lastErr = e;
      if (e instanceof Error && e.name === "AppError") throw e;
    }
    // Only GETs and idempotent-by-receipt order creation are retried.
    if (method !== "GET" && !path.startsWith("/orders")) break;
    await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
  }
  throw lastErr instanceof Error ? lastErr : upstream("Razorpay unreachable");
}

export interface RzpOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
}

export async function createRazorpayOrder(amountPaise: number, receipt: string, notes: Record<string, string>) {
  if (!isRazorpayLive()) {
    return { id: `order_MOCK${randomBytes(7).toString("hex")}`, amount: amountPaise, currency: "INR", receipt };
  }
  return call<RzpOrder>("POST", "/orders", { amount: amountPaise, currency: "INR", receipt, notes, payment_capture: 1 });
}

export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string) {
  const secret = env().RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  return safeEqual(expected, signature);
}

export function verifyWebhookSignature(rawBody: string, signature: string | null) {
  const secret = env().RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqual(expected, signature);
}

export interface RzpPayment {
  id: string;
  order_id: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  amount: number;
  method: string;
  error_description?: string | null;
}

export async function fetchPayment(paymentId: string) {
  return call<RzpPayment>("GET", `/payments/${encodeURIComponent(paymentId)}`);
}

export async function createRefund(paymentId: string, amountPaise: number, notes: Record<string, string>) {
  if (!isRazorpayLive() || paymentId.startsWith("pay_MOCK")) {
    return { id: `rfnd_MOCK${randomBytes(7).toString("hex")}`, status: "processed" as const, amount: amountPaise };
  }
  return call<{ id: string; status: "pending" | "processed" | "failed"; amount: number }>(
    "POST",
    `/payments/${encodeURIComponent(paymentId)}/refund`,
    { amount: amountPaise, speed: "normal", notes },
  );
}

export const publicRazorpayKey = () => (isRazorpayLive() ? env().RAZORPAY_KEY_ID! : "rzp_sandbox_mock");
