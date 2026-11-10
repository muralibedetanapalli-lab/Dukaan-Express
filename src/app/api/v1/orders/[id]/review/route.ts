import { z } from "zod";
import { api } from "@/server/http";
import { db } from "@/server/db";
import { conflict, notFound } from "@/server/errors";

export const POST = api(
  { roles: ["CUSTOMER"], body: z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(500).optional().nullable() }) },
  async ({ user, params, body }) => {
    const order = await db.order.findFirst({ where: { id: params.id, customerId: user.customerId! } });
    if (!order) throw notFound("Order");
    if (order.status !== "DELIVERED") throw conflict("You can rate an order after it is delivered");
    return db.$transaction(async (tx) => {
      const review = await tx.review.create({
        data: { orderId: order.id, customerId: user.customerId!, shopId: order.shopId, rating: body.rating, comment: body.comment ?? null },
      });
      const agg = await tx.review.aggregate({ where: { shopId: order.shopId }, _avg: { rating: true }, _count: true });
      await tx.shop.update({
        where: { id: order.shopId },
        data: { rating: Math.round((agg._avg.rating ?? 0) * 10) / 10, ratingCount: agg._count },
      });
      return review;
    });
  },
);
