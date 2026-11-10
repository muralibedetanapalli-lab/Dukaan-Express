import "server-only";
import type { DbOrTx } from "@/server/db";
import { db } from "@/server/db";
import type { CouponRule } from "./pricing";

export type CouponCheck = { ok: true; rule: CouponRule; couponId: string } | { ok: false; error: string };

export async function checkCoupon(
  code: string,
  ctx: { customerId: string; shopId: string; subtotal: number },
  client: DbOrTx = db,
): Promise<CouponCheck> {
  const c = await client.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });
  const now = new Date();
  if (!c || !c.isActive) return { ok: false, error: "This coupon code is not valid" };
  if (c.validFrom > now || (c.validTo && c.validTo < now)) return { ok: false, error: "This coupon has expired" };
  if (c.shopId && c.shopId !== ctx.shopId) return { ok: false, error: "This coupon is not valid for this shop" };
  if (c.usageLimit != null && c.usedCount >= c.usageLimit) return { ok: false, error: "This coupon has been fully redeemed" };
  const used = await client.couponRedemption.count({ where: { couponId: c.id, customerId: ctx.customerId } });
  if (used >= c.perUserLimit) return { ok: false, error: "You have already used this coupon" };
  if (c.firstOrderOnly) {
    const prior = await client.order.count({
      where: { customerId: ctx.customerId, status: { notIn: ["CANCELLED", "SHOP_REJECTED", "PAYMENT_PENDING"] } },
    });
    if (prior > 0) return { ok: false, error: "This coupon is valid on your first order only" };
  }
  return {
    ok: true,
    couponId: c.id,
    rule: { code: c.code, type: c.type, value: c.value, maxDiscount: c.maxDiscount, minOrderAmount: c.minOrderAmount },
  };
}

export async function availableCoupons(shopId: string | null) {
  const now = new Date();
  return db.coupon.findMany({
    where: {
      isActive: true,
      validFrom: { lte: now },
      OR: [{ validTo: null }, { validTo: { gte: now } }],
      AND: [{ OR: [{ shopId: null }, ...(shopId ? [{ shopId }] : [])] }],
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}
