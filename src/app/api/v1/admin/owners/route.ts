import { z } from "zod";
import { api } from "@/server/http";
import { db } from "@/server/db";
import { createOwner, zOwnerInput } from "@/server/services/admin";

export const GET = api({ roles: ["SUPER_ADMIN"], query: z.object({ q: z.string().max(80).optional() }) }, async ({ query }) => ({
  owners: await db.shopOwner.findMany({
    where: query.q
      ? { user: { OR: [{ name: { contains: query.q, mode: "insensitive" } }, { email: { contains: query.q, mode: "insensitive" } }, { phone: { contains: query.q } }] } }
      : {},
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, status: true, lastLoginAt: true, createdAt: true } },
      shops: { where: { deletedAt: null }, select: { id: true, name: true, isActive: true } },
    },
    orderBy: { createdAt: "desc" },
  }),
}));

export const POST = api({ roles: ["SUPER_ADMIN"], body: zOwnerInput }, async ({ user, body }) => createOwner(user, body));
