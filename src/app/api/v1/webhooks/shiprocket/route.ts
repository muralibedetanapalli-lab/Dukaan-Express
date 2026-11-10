import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { errorResponse } from "@/server/http";
import { handleShiprocketWebhook } from "@/server/services/shipment";

export const runtime = "nodejs";

/**
 * Shiprocket → Settings → API → Webhooks. Set the URL to {APP_URL}/api/v1/webhooks/shiprocket and the
 * token to SHIPROCKET_WEBHOOK_TOKEN (sent back as the `x-api-key` header).
 * Note: Shiprocket disallows the words "shiprocket"/"kartrocket" in webhook URLs on some accounts —
 * use the alias /api/v1/webhooks/courier in that case.
 */
export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    const result = await handleShiprocketWebhook(raw, req.headers.get("x-api-key"));
    return NextResponse.json({ data: result });
  } catch (e) {
    return errorResponse(e);
  }
}
