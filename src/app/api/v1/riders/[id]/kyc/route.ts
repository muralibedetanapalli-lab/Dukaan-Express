import { z } from "zod";
import { api } from "@/server/http";
import { reviewKyc } from "@/server/services/rider-kyc";

const zReview = z.discriminatedUnion("approve", [
  z.object({ approve: z.literal(true) }),
  z.object({ approve: z.literal(false), reason: z.string().trim().min(3, "Tell the rider what to fix").max(300) }),
]);

/** Approve or reject a rider's documents — their dealer or any admin. */
export const POST = api({ roles: ["DEALER", "SUPER_ADMIN"], body: zReview }, async ({ user, params, body }) => {
  await reviewKyc(user, params.id, body);
  return { ok: true };
});
