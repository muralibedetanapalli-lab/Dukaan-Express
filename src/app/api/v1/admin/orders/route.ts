import { z } from "zod";
import { api, paginate } from "@/server/http";
import { db } from "@/server/db";
import { ORDER_STATUSES } from "@/lib/order-status";
import type { Prisma } from "@/generated/prisma/client";

const zOrderFilters = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  shopId: z.string().optional(),
  customer: z.string().max(80).optional(),
  q: z.string().max(40).optional(),
  paymentStatus: z.enum(["PENDING", "AUTHORIZED", "CAPTURED", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const GET = api({ roles: ["SUPER_ADMIN"], query: zOrderFilters }, async ({ query }) => {
  const where: Prisma.OrderWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.shopId ? { shopId: query.shopId } : {}),
    ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
    ...(query.q ? { orderNumber: { contains: query.q.toUpperCase() } } : {}),
    ...(query.customer
      ? { OR: [{ contactName: { contains: query.customer, mode: "insensitive" } }, { contactPhone: { contains: query.customer } }] }
      : {}),
    ...(query.from || query.to ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } } : {}),
  };
  const [items, total] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { shop: { select: { id: true, name: true } }, shipment: { select: { status: true, awbCode: true } } },
      ...paginate(query.page, query.pageSize),
    }),
    db.order.count({ where }),
  ]);
  return { items, total, page: query.page, pageSize: query.pageSize };
});
