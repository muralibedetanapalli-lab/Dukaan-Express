import { api } from "@/server/http";
import { cancelWithdrawal } from "@/server/services/rider";

export const POST = api({ roles: ["RIDER"] }, async ({ user, params }) => {
  await cancelWithdrawal(user, params.id);
  return { ok: true };
});
