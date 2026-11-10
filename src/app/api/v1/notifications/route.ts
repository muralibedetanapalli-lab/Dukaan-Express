import { z } from "zod";
import { api } from "@/server/http";
import { db } from "@/server/db";

const ALL_ROLES = ["CUSTOMER", "SHOP_OWNER", "SUPER_ADMIN"] as ("CUSTOMER" | "SHOP_OWNER" | "SUPER_ADMIN")[];

export const GET = api({ roles: ALL_ROLES }, async ({ user }) => {
  const [items, unread] = await Promise.all([
    db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  return { items, unread };
});

/** Mark notifications read: { ids: [...] } or { all: true }. */
export const POST = api(
  { roles: ALL_ROLES, body: z.object({ ids: z.array(z.string()).max(100).optional(), all: z.boolean().optional() }) },
  async ({ user, body }) => {
    await db.notification.updateMany({
      where: { userId: user.id, readAt: null, ...(body.all ? {} : { id: { in: body.ids ?? [] } }) },
      data: { readAt: new Date() },
    });
    return { ok: true };
  },
);
