import { z } from "zod";
import { api } from "@/server/http";
import { db } from "@/server/db";
import { notFound } from "@/server/errors";
import { resetPassword } from "@/server/services/admin";

/** Reset a dealer's password (temporary password returned once). */
export const POST = api({ roles: ["SUPER_ADMIN"], body: z.object({ password: z.string().max(100).optional().nullable() }) }, async ({ user, params, body }) => {
  const d = await db.dealer.findUnique({ where: { id: params.id }, select: { userId: true } });
  if (!d) throw notFound("Dealer");
  return resetPassword(user, d.userId, body.password);
});
