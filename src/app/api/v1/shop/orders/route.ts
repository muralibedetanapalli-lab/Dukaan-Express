import { z } from "zod";
import { api, paginate } from "@/server/http";
import { db } from "@/server/db";
import { activeShopFor } from "@/server/services/inventory";
import { ORDER_STATUSES } from "@/lib/order-status";
import type { OrderStatus } from "@/generated/prisma/client";

const TABS: Record<string, OrderStatus[]> = {
  new: ["SHOP_PENDING"],
  active: ["SHOP_ACCEPTED", "PREPARING", "READY_FOR_PACKING"],
  dispatch: ["PACKED", "SHIPMENT_CREATING", "SHIPMENT_CREATED", "COURIER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY"],
  completed: ["DELIVERED"],
  closed: ["CANCELLED", "SHOP_REJECTED", "REFUND_PENDING", "REFUNDED", "DELIVERY_FAILED"],
};

export const GET = api(
  {
    roles: ["SHOP_OWNER"],
    query: z.object({
      tab: z.enum(["new", "active", "dispatch", "completed", "closed", "all"]).default("all"),
      status: z.enum(ORDER_STATUSES).optional(),
      q: z.string().max(40).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(30),
    }),
  },
  async ({ user, query }) => {
    const { shop } = await activeShopFor(user);
    const where = {
      shopId: shop.id,
      // Shops never see orders still waiting for online payment.
      status: query.status ? query.status : query.tab === "all" ? { notIn: ["CREATED", "PAYMENT_PENDING"] as OrderStatus[] } : { in: TABS[query.tab] },
      ...(query.q ? { orderNumber: { contains: query.q.toUpperCase() } } : {}),
    };
    const [items, total, counts] = await Promise.all([
      db.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: { items: { select: { productName: true, quantity: true } }, shipment: { select: { status: true, awbCode: true } } },
        ...paginate(query.page, query.pageSize),
      }),
      db.order.count({ where }),
      db.order.groupBy({ by: ["status"], where: { shopId: shop.id }, _count: true }),
    ]);
    const tabCounts = Object.fromEntries(
      Object.entries(TABS).map(([k, statuses]) => [k, counts.filter((c) => statuses.includes(c.status)).reduce((s, c) => s + c._count, 0)]),
    );
    return { items, total, page: query.page, pageSize: query.pageSize, tabCounts };
  },
);
