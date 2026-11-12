import { z } from "zod";
import { api } from "@/server/http";
import { rejectDealerPayout } from "@/server/services/dealer";

/** Decline a dealer payout; its commission goes back to the dealer's balance. */
export const POST = api({ roles: ["SUPER_ADMIN"], body: z.object({ reason: z.string().trim().min(3).max(300) }) }, async ({ user, params, body }) => {
  await rejectDealerPayout(user, params.id, body.reason);
  return { ok: true };
});
