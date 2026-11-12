import { api } from "@/server/http";
import { cancelDealerPayout } from "@/server/services/dealer";

export const POST = api({ roles: ["DEALER"] }, async ({ user, params }) => {
  await cancelDealerPayout(user, params.id);
  return { ok: true };
});
