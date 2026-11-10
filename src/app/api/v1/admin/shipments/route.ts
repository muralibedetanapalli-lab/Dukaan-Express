import { z } from "zod";
import { api, paginate } from "@/server/http";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";

export const GET = api(
  {
    roles: ["SUPER_ADMIN"],
    query: z.object({
      status: z
        .enum(["PENDING", "CREATING", "CREATED", "COURIER_ASSIGNED", "PICKUP_SCHEDULED", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "FAILED_ATTEMPT", "RTO", "CANCELLED", "EXCEPTION"])
        .optional(),
      q: z.string().max(40).optional(),
      failedOnly: z.enum(["true", "false"]).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(25),
    }),
  },
  async ({ query }) => {
    const where: Prisma.ShipmentWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.failedOnly === "true" ? { failedDeliveryCount: { gt: 0 } } : {}),
      ...(query.q ? { OR: [{ awbCode: { contains: query.q } }, { order: { orderNumber: { contains: query.q.toUpperCase() } } }] } : {}),
    };
    const [items, total, exceptions] = await Promise.all([
      db.shipment.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        include: { order: { select: { id: true, orderNumber: true, status: true, shop: { select: { name: true } } } }, deliveryPartner: true },
        ...paginate(query.page, query.pageSize),
      }),
      db.shipment.count({ where }),
      db.shipment.count({ where: { status: "EXCEPTION" } }),
    ]);
    return { items, total, exceptions, page: query.page, pageSize: query.pageSize };
  },
);
