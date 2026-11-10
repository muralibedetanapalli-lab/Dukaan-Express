import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { errorResponse } from "@/server/http";
import { unauthorized } from "@/server/errors";
import { safeEqual } from "@/server/auth/password";
import { expireUnpaidOrders } from "@/server/services/payment";
import { transitionOrder, SYSTEM } from "@/server/services/order";
import { getSettings } from "@/server/services/settings";
import { createShipmentForOrder } from "@/server/services/shipment";

export const runtime = "nodejs";

/**
 * Periodic maintenance (Vercel Cron, every 5 min): expire unpaid orders, auto-reject orders a shop
 * ignored, reconcile shipments stuck in SHIPMENT_CREATING, and prune old OTPs / idempotency keys.
 * Protected by `Authorization: Bearer ${CRON_SECRET}`.
 */
export async function GET(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    const auth = req.headers.get("authorization") ?? "";
    if (!secret || !safeEqual(auth, `Bearer ${secret}`)) throw unauthorized("Invalid cron secret");

    const settings = await getSettings(true);
    const expired = await expireUnpaidOrders();

    const acceptCutoff = new Date(Date.now() - settings.order.shopAcceptTimeoutMinutes * 60_000);
    const ignored = await db.order.findMany({ where: { status: "SHOP_PENDING", updatedAt: { lt: acceptCutoff } }, select: { id: true } });
    for (const o of ignored) {
      await transitionOrder(o.id, "SHOP_REJECTED", SYSTEM, {
        remarks: "Shop did not respond in time",
        data: { rejectionReason: "Shop did not respond in time" },
      }).catch((e) => console.warn("[cron] auto-reject failed", o.id, e));
    }

    const stuck = await db.order.findMany({
      where: { status: "SHIPMENT_CREATING", shipment: { status: "CREATING", updatedAt: { lt: new Date(Date.now() - 2 * 60_000) } } },
      select: { id: true },
    });
    for (const o of stuck) await createShipmentForOrder(o.id, SYSTEM).catch((e) => console.warn("[cron] reconcile failed", o.id, e));

    const day = new Date(Date.now() - 86400_000);
    const [otps, keys] = await Promise.all([
      db.otp.deleteMany({ where: { createdAt: { lt: day } } }),
      db.idempotencyKey.deleteMany({ where: { createdAt: { lt: day } } }),
    ]);
    return NextResponse.json({ data: { expired, autoRejected: ignored.length, reconciled: stuck.length, prunedOtps: otps.count, prunedKeys: keys.count } });
  } catch (e) {
    return errorResponse(e);
  }
}
