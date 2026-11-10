import { z } from "zod";
import { api, paginate } from "@/server/http";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";

export const GET = api(
  {
    roles: ["SUPER_ADMIN"],
    query: z.object({
      q: z.string().max(80).optional(),
      categoryId: z.string().optional(),
      shopId: z.string().optional(),
      approval: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(25),
    }),
  },
  async ({ query }) => {
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.approval ? { approvalStatus: query.approval } : {}),
      ...(query.shopId ? { inventory: { some: { shopId: query.shopId, deletedAt: null } } } : {}),
      ...(query.q
        ? { OR: [{ name: { contains: query.q, mode: "insensitive" } }, { sku: { contains: query.q, mode: "insensitive" } }, { brand: { contains: query.q, mode: "insensitive" } }] }
        : {}),
    };
    const [items, total] = await Promise.all([
      db.product.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          images: { take: 1, orderBy: { sortOrder: "asc" } },
          category: true,
          subcategory: true,
          inventory: { where: { deletedAt: null, ...(query.shopId ? { shopId: query.shopId } : {}) }, include: { shop: { select: { id: true, name: true } }, variant: true } },
        },
        ...paginate(query.page, query.pageSize),
      }),
      db.product.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  },
);
