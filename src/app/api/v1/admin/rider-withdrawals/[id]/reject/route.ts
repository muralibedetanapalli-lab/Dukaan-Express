import { z } from "zod";
import { api } from "@/server/http";
import { rejectWithdrawal } from "@/server/services/rider";

/** Decline a rider withdrawal; the money goes back to the rider wallet. */
export const POST = api({ roles: ["SUPER_ADMIN"], body: z.object({ reason: z.string().trim().min(3).max(300) }) }, async ({ user, params, body }) => {
  await rejectWithdrawal(user, params.id, body.reason);
  return { ok: true };
});
