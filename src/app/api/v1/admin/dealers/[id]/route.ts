import { api } from "@/server/http";
import { updateDealer, zDealerUpdate } from "@/server/services/dealer";

/** Edit a dealer: name, phone, status, commission share, regions. */
export const PATCH = api({ roles: ["SUPER_ADMIN"], body: zDealerUpdate }, async ({ user, params, body }) => {
  await updateDealer(user, params.id, body);
  return { ok: true };
});
