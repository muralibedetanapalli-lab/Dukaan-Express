import { api } from "@/server/http";
import { db } from "@/server/db";
import { zServiceArea } from "@/server/validators-admin";

export const PATCH = api({ roles: ["SUPER_ADMIN"], body: zServiceArea.partial() }, async ({ params, body }) =>
  db.serviceArea.update({ where: { id: params.id }, data: body }),
);

export const DELETE = api({ roles: ["SUPER_ADMIN"] }, async ({ params }) => {
  await db.serviceArea.delete({ where: { id: params.id } });
  return { ok: true };
});
