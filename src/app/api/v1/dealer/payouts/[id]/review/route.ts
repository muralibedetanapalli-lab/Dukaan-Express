import { z } from "zod";
import { api } from "@/server/http";
import { reviewShopPayout } from "@/server/services/dealer";

const zReview = z.discriminatedUnion("approve", [
  z.object({ approve: z.literal(true), note: z.string().trim().max(300).optional().nullable() }),
  z.object({ approve: z.literal(false), reason: z.string().trim().min(3, "Give a reason (at least 3 characters)").max(300) }),
]);

/** Dealer approves a shop payout (sends it to the admin) or declines it. */
export const POST = api({ roles: ["DEALER"], body: zReview }, async ({ user, params, body }) => reviewShopPayout(user, params.id, body));
