import { api } from "@/server/http";
import { db } from "@/server/db";
import { zBanner } from "@/server/validators-admin";

export const PATCH = api({ roles: ["SUPER_ADMIN"], body: zBanner.partial() }, async ({ params, body }) =>
  db.banner.update({ where: { id: params.id }, data: body }),
);

export const DELETE = api({ roles: ["SUPER_ADMIN"] }, async ({ params }) => {
  await db.banner.delete({ where: { id: params.id } });
  return { ok: true };
});
