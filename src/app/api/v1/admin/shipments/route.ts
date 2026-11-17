import { z } from "zod";
import { api, paginate } from "@/server/http";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";

/** Deliveries (own staff or rider), newest activity first. */
export const GET = api(
  {
    roles: ["SUPER_ADMIN"],
    query: z.object({
      status: z.enum(["PENDING", "CREATED", "COURIER_ASSIGNED", "OUT_FOR_DELIVERY", "DELIVERED", "FAILED_ATTEMPT", "CANCELLED"]).optional(),
      mode: z.enum(["OWN", "RIDER"]).optional(),
      q: z.string().max(40).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(25),
    }),
  },
  async ({ query }) => {
    const where: Prisma.ShipmentWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.mode ? { mode: query.mode } : {}),
      ...(query.q ? { order: { orderNumber: { contains: query.q.toUpperCase() } } } : {}),
    };
    const [items, total] = await Promise.all([
      db.shipment.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        include: { order: { select: { id: true, orderNumber: true, status: true, shop: { select: { name: true } } } }, rider: { select: { user: { select: { name: true, phone: true } } } } },
        ...paginate(query.page, query.pageSize),
      }),
      db.shipment.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  },
);
