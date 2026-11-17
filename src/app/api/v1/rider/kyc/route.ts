import { api } from "@/server/http";
import { submitKyc, zKycSubmit } from "@/server/services/rider-kyc";

/** Submit documents for approval. */
export const POST = api({ roles: ["RIDER"], body: zKycSubmit, rateLimit: { name: "kyc-submit", limit: 10 } }, async ({ user, body }) => {
  await submitKyc(user, body);
  return { ok: true };
});
