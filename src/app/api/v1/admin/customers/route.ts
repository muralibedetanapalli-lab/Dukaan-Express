import { z } from "zod";
import { api, paginate } from "@/server/http";
import { db } from "@/server/db";
import { customerWhere } from "@/server/services/admin";

export const GET = api(
  {
    roles: ["SUPER_ADMIN"],
    query: z.object({ q: z.string().max(80).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) }),
  },
  async ({ query }) => {
    const where = customerWhere(query.q);
    const [items, total] = await Promise.all([
      db.customer.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true, phone: true, email: true, status: true, lastLoginAt: true } }, _count: { select: { orders: true, tickets: true } } },
        ...paginate(query.page, query.pageSize),
      }),
      db.customer.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  },
);
