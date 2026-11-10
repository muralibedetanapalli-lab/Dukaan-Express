import { z } from "zod";
import { api } from "@/server/http";
import { db } from "@/server/db";
import { notFound } from "@/server/errors";
import { setCustomerStatus } from "@/server/services/admin";

export const GET = api({ roles: ["SUPER_ADMIN"] }, async ({ params }) => {
  const customer = await db.customer.findUnique({
    where: { id: params.id },
    include: {
      user: { select: { name: true, phone: true, email: true, status: true, lastLoginAt: true, createdAt: true } },
      addresses: { where: { deletedAt: null } },
      orders: { orderBy: { createdAt: "desc" }, take: 100, include: { shop: { select: { name: true } } } },
      tickets: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!customer) throw notFound("Customer");
  return { customer };
});

export const PATCH = api(
  { roles: ["SUPER_ADMIN"], body: z.object({ status: z.enum(["ACTIVE", "INACTIVE"]) }) },
  async ({ user, params, body }) => {
    await setCustomerStatus(user, params.id, body.status);
    return { ok: true };
  },
);
