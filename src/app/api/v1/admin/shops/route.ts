import { z } from "zod";
import { api, paginate } from "@/server/http";
import { db } from "@/server/db";
import { createShop, zShopInput } from "@/server/services/admin";
import type { Prisma } from "@/generated/prisma/client";

export const GET = api(
  {
    roles: ["SUPER_ADMIN"],
    query: z.object({
      q: z.string().max(80).optional(),
      approval: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
      active: z.enum(["true", "false"]).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(25),
    }),
  },
  async ({ query }) => {
    const where: Prisma.ShopWhereInput = {
      deletedAt: null,
      ...(query.approval ? { approvalStatus: query.approval } : {}),
      ...(query.active ? { isActive: query.active === "true" } : {}),
      ...(query.q
        ? { OR: [{ name: { contains: query.q, mode: "insensitive" } }, { contactPhone: { contains: query.q } }, { address: { city: { contains: query.q, mode: "insensitive" } } }] }
        : {}),
    };
    const [items, total] = await Promise.all([
      db.shop.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: { address: true, category: true, owner: { include: { user: { select: { name: true, email: true } } } }, _count: { select: { inventory: true, orders: true } } },
        ...paginate(query.page, query.pageSize),
      }),
      db.shop.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  },
);

export const POST = api({ roles: ["SUPER_ADMIN"], body: zShopInput }, async ({ user, body }) => createShop(user, body));
