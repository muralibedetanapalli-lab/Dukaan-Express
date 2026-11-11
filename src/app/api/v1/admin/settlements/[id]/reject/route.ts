import { z } from "zod";
import { api } from "@/server/http";
import { rejectPayout } from "@/server/services/payout";

/** Decline a payout request; its orders go back to the shop's available balance. */
export const POST = api({ roles: ["SUPER_ADMIN"], body: z.object({ reason: z.string().trim().min(3).max(300) }) }, async ({ user, params, body }) =>
  rejectPayout(user, params.id, body.reason),
);
