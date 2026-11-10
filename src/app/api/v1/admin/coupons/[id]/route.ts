import { api } from "@/server/http";
import { db } from "@/server/db";
import { zCoupon } from "@/server/validators-admin";
import { audit } from "@/server/services/audit";

export const PATCH = api({ roles: ["SUPER_ADMIN"], body: zCoupon.partial() }, async ({ user, params, body }) => {
  const c = await db.coupon.update({ where: { id: params.id }, data: body });
  await audit({ id: user.id, role: user.role }, "coupon.update", "Coupon", c.id, { after: body });
  return c;
});
