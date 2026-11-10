import { api } from "@/server/http";
import { db } from "@/server/db";
import { notFound } from "@/server/errors";
import { zAddress } from "@/server/validators";

async function own(customerId: string, id: string) {
  const a = await db.customerAddress.findFirst({ where: { id, customerId, deletedAt: null } });
  if (!a) throw notFound("Address");
  return a;
}

export const PATCH = api({ roles: ["CUSTOMER"], body: zAddress.partial() }, async ({ user, params, body }) => {
  await own(user.customerId!, params.id);
  return db.$transaction(async (tx) => {
    if (body.isDefault) await tx.customerAddress.updateMany({ where: { customerId: user.customerId! }, data: { isDefault: false } });
    return tx.customerAddress.update({ where: { id: params.id }, data: body });
  });
});

export const DELETE = api({ roles: ["CUSTOMER"] }, async ({ user, params }) => {
  const a = await own(user.customerId!, params.id);
  await db.customerAddress.update({ where: { id: a.id }, data: { deletedAt: new Date(), isDefault: false } });
  if (a.isDefault) {
    const next = await db.customerAddress.findFirst({ where: { customerId: user.customerId!, deletedAt: null }, orderBy: { updatedAt: "desc" } });
    if (next) await db.customerAddress.update({ where: { id: next.id }, data: { isDefault: true } });
  }
  return { ok: true };
});
