import { api } from "@/server/http";
import { db } from "@/server/db";
import { badRequest } from "@/server/errors";
import { zCoupon } from "@/server/validators-admin";
import { audit } from "@/server/services/audit";

export const GET = api({ roles: ["SUPER_ADMIN"] }, async () => ({
  coupons: await db.coupon.findMany({ orderBy: { createdAt: "desc" }, include: { shop: { select: { name: true } } } }),
}));

export const POST = api({ roles: ["SUPER_ADMIN"], body: zCoupon }, async ({ user, body }) => {
  if (body.type === "PERCENT" && body.value > 10000) throw badRequest("Percentage cannot exceed 100%");
  const c = await db.coupon.create({ data: body });
  await audit({ id: user.id, role: user.role }, "coupon.create", "Coupon", c.id, { after: body });
  return c;
});
