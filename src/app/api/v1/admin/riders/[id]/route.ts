import { api } from "@/server/http";
import { updateRider, zRiderUpdate } from "@/server/services/rider";

export const PATCH = api({ roles: ["SUPER_ADMIN"], body: zRiderUpdate }, async ({ user, params, body }) => {
  await updateRider(user, params.id, body);
  return { ok: true };
});
