import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { errorResponse } from "@/server/http";
import { unauthorized } from "@/server/errors";
import { safeEqual } from "@/server/auth/password";
import { expireUnpaidOrders, reconcileRefunds } from "@/server/services/payment";
import { expireUnpaidBulkOrders } from "@/server/services/bulk";
import { transitionOrder, SYSTEM } from "@/server/services/order";
import { getSettings } from "@/server/services/settings";
import { sweepWaitingDeliveries } from "@/server/services/delivery";
import { ensurePreviousMonthBadges } from "@/server/services/badges";

export const runtime = "nodejs";

/**
 * Periodic maintenance (in-process timer every 5 min while the app is awake — see src/instrumentation.ts — plus an
 * Azure Container Apps job every 6 h as a safety net): expire unpaid orders (after re-checking
 * Cashfree), settle refunds whose webhook was missed, auto-reject orders a shop
 * ignored, re-offer deliveries still waiting for a rider, and prune old OTPs / idempotency keys.
 * Protected by `Authorization: Bearer ${CRON_SECRET}`.
 */
export async function GET(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    const auth = req.headers.get("authorization") ?? "";
    if (!secret || !safeEqual(auth, `Bearer ${secret}`)) throw unauthorized("Invalid cron secret");

    const settings = await getSettings(true);
    const expired = await expireUnpaidOrders();
    const bulkExpired = await expireUnpaidBulkOrders().catch((e) => {
      console.warn("[cron] bulk expiry failed", e);
      return 0;
    });
    const refundsSettled = await reconcileRefunds();

    const acceptCutoff = new Date(Date.now() - settings.order.shopAcceptTimeoutMinutes * 60_000);
    const ignored = await db.order.findMany({ where: { status: "SHOP_PENDING", updatedAt: { lt: acceptCutoff } }, select: { id: true } });
    for (const o of ignored) {
      await transitionOrder(o.id, "SHOP_REJECTED", SYSTEM, {
        remarks: "Shop did not respond in time",
        data: { rejectionReason: "Shop did not respond in time" },
      }).catch((e) => console.warn("[cron] auto-reject failed", o.id, e));
    }

    // Re-offer deliveries still waiting for a rider; alert the shop/admins once when nobody accepts in time.
    const riders = await sweepWaitingDeliveries().catch((e) => {
      console.warn("[cron] rider sweep failed", e);
      return { waiting: 0, alerted: 0 };
    });

    // Award last month's star badges once the month is over (idempotent).
    const badges = await ensurePreviousMonthBadges().catch((e) => {
      console.warn("[cron] badges failed", e);
      return 0;
    });

    const day = new Date(Date.now() - 86400_000);
    const [otps, keys] = await Promise.all([
      db.otp.deleteMany({ where: { createdAt: { lt: day } } }),
      db.idempotencyKey.deleteMany({ where: { createdAt: { lt: day } } }),
    ]);
    return NextResponse.json({ data: { expired, bulkExpired, refundsSettled, autoRejected: ignored.length, waitingForRider: riders.waiting, noRiderAlerts: riders.alerted, badgesAwarded: badges, prunedOtps: otps.count, prunedKeys: keys.count } });
  } catch (e) {
    return errorResponse(e);
  }
}
