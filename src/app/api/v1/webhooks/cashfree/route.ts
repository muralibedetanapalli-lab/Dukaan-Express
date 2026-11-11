import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { errorResponse } from "@/server/http";
import { handleCashfreeWebhook } from "@/server/services/payment";

export const runtime = "nodejs";

/** Cashfree Dashboard → Developers → Webhooks (version 2025-01-01): payment success/failed/user dropped and refund status. */
export async function POST(req: NextRequest) {
  try {
    const raw = await req.text(); // raw body is required for HMAC verification
    const h = req.headers;
    const result = await handleCashfreeWebhook(raw, h.get("x-webhook-signature"), h.get("x-webhook-timestamp"), h.get("x-idempotency-key"));
    return NextResponse.json({ data: result });
  } catch (e) {
    return errorResponse(e);
  }
}
