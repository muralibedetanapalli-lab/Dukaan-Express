import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { errorResponse } from "@/server/http";
import { handleRazorpayWebhook } from "@/server/services/payment";

export const runtime = "nodejs";

/** Configure in Razorpay Dashboard → Webhooks: events payment.captured, payment.failed, refund.processed, refund.failed. */
export async function POST(req: NextRequest) {
  try {
    const raw = await req.text(); // raw body is required for HMAC verification
    const result = await handleRazorpayWebhook(raw, req.headers.get("x-razorpay-signature"), req.headers.get("x-razorpay-event-id"));
    return NextResponse.json({ data: result });
  } catch (e) {
    return errorResponse(e);
  }
}
