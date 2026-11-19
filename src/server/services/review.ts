import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { badRequest, conflict, notFound } from "@/server/errors";

const stars = z.number().int().min(1).max(5);

export const zReviewInput = z.object({
  rating: stars,
  comment: z.string().trim().max(500).optional().nullable(),
  /** The Dukaan rider who delivered the order; only for rider deliveries. */
  riderRating: stars.optional().nullable(),
  riderComment: z.string().trim().max(300).optional().nullable(),
});
export type ReviewInput = z.infer<typeof zReviewInput>;

/**
 * Customer rates a delivered order: the shop, and the rider when a Dukaan rider delivered it.
 * Keeps the shop's and rider's average rating current; both feed the monthly star badges.
 */
export async function rateOrder(customerId: string, orderId: string, input: ReviewInput) {
  const order = await db.order.findFirst({
    where: { id: orderId, customerId },
    include: { shipment: { select: { mode: true, riderId: true } }, review: { select: { id: true } } },
  });
  if (!order) throw notFound("Order");
  if (order.status !== "DELIVERED") throw conflict("You can rate an order after it is delivered");
  if (order.review) throw conflict("You have already rated this order");
  const riderId = order.shipment?.mode === "RIDER" ? order.shipment.riderId : null;
  if (input.riderRating && !riderId) throw badRequest("This order was not delivered by a Dukaan rider");
  const ratesRider = !!(riderId && input.riderRating);

  return db.$transaction(async (tx) => {
    const review = await tx.review.create({
      data: {
        orderId: order.id,
        customerId,
        shopId: order.shopId,
        rating: input.rating,
        comment: input.comment || null,
        riderId: ratesRider ? riderId : null,
        riderRating: ratesRider ? input.riderRating! : null,
        riderComment: ratesRider ? input.riderComment || null : null,
      },
    });
    const shop = await tx.review.aggregate({ where: { shopId: order.shopId }, _avg: { rating: true }, _count: true });
    await tx.shop.update({
      where: { id: order.shopId },
      data: { rating: Math.round((shop._avg.rating ?? 0) * 10) / 10, ratingCount: shop._count },
    });
    if (ratesRider) {
      const r = await tx.review.aggregate({ where: { riderId, riderRating: { not: null } }, _avg: { riderRating: true }, _count: { riderRating: true } });
      await tx.rider.update({
        where: { id: riderId! },
        data: { rating: Math.round((r._avg.riderRating ?? 0) * 10) / 10, ratingCount: r._count.riderRating },
      });
    }
    return review;
  });
}
