import { api } from "@/server/http";
import { acceptJob } from "@/server/services/delivery";

/** Claim a delivery. The first rider to accept gets it. */
export const POST = api({ roles: ["RIDER"], rateLimit: { name: "rider-accept", limit: 30 } }, async ({ user, params }) => {
  await acceptJob(user, params.id);
  return { ok: true };
});
