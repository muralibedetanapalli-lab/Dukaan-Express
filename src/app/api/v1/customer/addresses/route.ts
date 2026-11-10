import { api } from "@/server/http";
import { zAddress } from "@/server/validators";
import { db } from "@/server/db";
import { badRequest } from "@/server/errors";


export const GET = api({ roles: ["CUSTOMER"] }, async ({ user }) => ({
  addresses: await db.customerAddress.findMany({
    where: { customerId: user.customerId!, deletedAt: null },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  }),
}));

export const POST = api({ roles: ["CUSTOMER"], body: zAddress }, async ({ user, body }) => {
  const count = await db.customerAddress.count({ where: { customerId: user.customerId!, deletedAt: null } });
  if (count >= 20) throw badRequest("You can save up to 20 addresses");
  const isDefault = body.isDefault || count === 0;
  return db.$transaction(async (tx) => {
    if (isDefault) await tx.customerAddress.updateMany({ where: { customerId: user.customerId! }, data: { isDefault: false } });
    return tx.customerAddress.create({ data: { ...body, isDefault, customerId: user.customerId! } });
  });
});
