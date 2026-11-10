import { z } from "zod";
import { api, paginate } from "@/server/http";
import { db } from "@/server/db";

export const GET = api(
  {
    roles: ["SUPER_ADMIN"],
    query: z.object({
      entityType: z.string().max(40).optional(),
      entityId: z.string().max(64).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(50),
    }),
  },
  async ({ query }) => {
    const where = { ...(query.entityType ? { entityType: query.entityType } : {}), ...(query.entityId ? { entityId: query.entityId } : {}) };
    const [items, total] = await Promise.all([
      db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, include: { actor: { select: { name: true, email: true } } }, ...paginate(query.page, query.pageSize) }),
      db.auditLog.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  },
);
