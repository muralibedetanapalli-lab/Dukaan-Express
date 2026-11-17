import { api } from "@/server/http";
import { markWithdrawalPaid, zWithdrawalPaid } from "@/server/services/rider";

/** Record the bank transfer for a rider withdrawal. */
export const POST = api({ roles: ["SUPER_ADMIN"], body: zWithdrawalPaid }, async ({ user, params, body }) => {
  await markWithdrawalPaid(user, params.id, body);
  return { ok: true };
});
