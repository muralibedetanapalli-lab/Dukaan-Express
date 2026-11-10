import { NextResponse } from "next/server";
import { z } from "zod";
import { api, paginate, zPage } from "@/server/http";
import { db } from "@/server/db";
import { AppError, badRequest } from "@/server/errors";
import { placeOrder } from "@/server/services/order";
import type { Prisma } from "@/generated/prisma/client";

export const GET = api({ roles: ["CUSTOMER"], query: zPage }, async ({ user, query }) => {
  const where = { customerId: user.customerId! };
  const [items, total] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { shop: { select: { name: true, slug: true, logoUrl: true } }, items: { select: { productName: true, quantity: true, imageUrl: true } } },
      ...paginate(query.page, query.pageSize),
    }),
    db.order.count({ where }),
  ]);
  return { items, total, page: query.page, pageSize: query.pageSize };
});

/**
 * Place an order from the current cart. Send an `Idempotency-Key` header (UUID) — retries with the
 * same key return the original response instead of creating a second order.
 */
export const POST = api(
  {
    roles: ["CUSTOMER"],
    body: z.object({
      addressId: z.string().min(1),
      paymentMethod: z.enum(["UPI", "CARD", "NETBANKING", "COD"]),
      notes: z.string().trim().max(300).optional().nullable(),
    }),
    rateLimit: { name: "place-order", limit: 10 },
  },
  async ({ req, user, body }) => {
    const key = req.headers.get("idempotency-key");
    if (!key || key.length < 8 || key.length > 100) throw badRequest("Idempotency-Key header is required");
    const scopedKey = `order:${user.id}:${key}`;
    try {
      await db.idempotencyKey.create({ data: { key: scopedKey, userId: user.id, scope: "order.place" } });
    } catch {
      const prior = await db.idempotencyKey.findUnique({ where: { key: scopedKey } });
      if (prior?.response) return NextResponse.json(prior.response, { status: prior.statusCode ?? 200 });
      throw new AppError(409, "IN_PROGRESS", "This order is already being placed");
    }
    try {
      const order = await placeOrder({ userId: user.id, customerId: user.customerId! }, body);
      const response = { data: { order: { id: order.id, orderNumber: order.orderNumber, status: order.status, total: order.total, paymentMethod: order.paymentMethod } } };
      await db.idempotencyKey.update({ where: { key: scopedKey }, data: { response: response as Prisma.InputJsonValue, statusCode: 200 } });
      return NextResponse.json(response);
    } catch (e) {
      // Failed attempts can be retried with the same key.
      await db.idempotencyKey.delete({ where: { key: scopedKey } }).catch(() => {});
      throw e;
    }
  },
);
