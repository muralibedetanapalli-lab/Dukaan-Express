import { z } from "zod";
import { api } from "@/server/http";
import { assignShopDealer } from "@/server/services/dealer";

/** Assign the shop to a dealer, or remove its dealer (dealerId: null). */
export const PATCH = api({ roles: ["SUPER_ADMIN"], body: z.object({ dealerId: z.string().nullable() }) }, async ({ user, params, body }) => {
  await assignShopDealer(user, params.id, body.dealerId);
  return { ok: true };
});
