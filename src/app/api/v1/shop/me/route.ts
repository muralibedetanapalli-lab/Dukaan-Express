import { cookies } from "next/headers";
import { z } from "zod";
import { api } from "@/server/http";
import { db } from "@/server/db";
import { notFound } from "@/server/errors";
import { ACTIVE_SHOP_COOKIE, activeShopFor } from "@/server/services/inventory";
import { audit } from "@/server/services/audit";

export const GET = api({ roles: ["SHOP_OWNER"] }, async ({ user }) => {
  const { shop, shops } = await activeShopFor(user);
  return { shop, shops: shops.map((s) => ({ id: s.id, name: s.name })) };
});

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** Owners can toggle order intake, switch active shop, and edit operating hours / prep time. */
export const PATCH = api(
  {
    roles: ["SHOP_OWNER"],
    body: z.object({
      switchToShopId: z.string().optional(),
      acceptingOrders: z.boolean().optional(),
      avgPrepMinutes: z.number().int().min(1).max(120).optional(),
      hours: z
        .array(z.object({ dayOfWeek: z.number().int().min(0).max(6), openTime: hhmm, closeTime: hhmm, isClosed: z.boolean() }))
        .max(7)
        .optional(),
    }),
  },
  async ({ user, body }) => {
    if (body.switchToShopId) {
      const own = await db.shop.findFirst({ where: { id: body.switchToShopId, ownerId: user.shopOwnerId!, deletedAt: null } });
      if (!own) throw notFound("Shop");
      (await cookies()).set(ACTIVE_SHOP_COOKIE, own.id, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
      return { shopId: own.id };
    }
    const { shop } = await activeShopFor(user);
    await db.shop.update({
      where: { id: shop.id },
      data: { acceptingOrders: body.acceptingOrders, avgPrepMinutes: body.avgPrepMinutes },
    });
    for (const h of body.hours ?? []) {
      await db.shopOperatingHours.upsert({
        where: { shopId_dayOfWeek: { shopId: shop.id, dayOfWeek: h.dayOfWeek } },
        create: { shopId: shop.id, ...h },
        update: h,
      });
    }
    await audit({ id: user.id, role: user.role }, "shop.self_update", "Shop", shop.id, { after: body });
    return { ok: true };
  },
);
