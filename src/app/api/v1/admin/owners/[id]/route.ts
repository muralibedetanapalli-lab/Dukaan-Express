import { z } from "zod";
import { api, zPhone } from "@/server/http";
import { resetPassword, updateOwner } from "@/server/services/admin";

/** `id` is the owner's *user* id. */
export const PATCH = api(
  {
    roles: ["SUPER_ADMIN"],
    body: z.object({
      name: z.string().trim().min(2).max(80).optional(),
      email: z.email().optional(),
      phone: zPhone.optional(),
      status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
    }),
  },
  async ({ user, params, body }) => updateOwner(user, params.id, body).then((u) => ({ id: u.id, status: u.status })),
);

export const POST = api(
  { roles: ["SUPER_ADMIN"], body: z.object({ action: z.literal("reset_password"), newPassword: z.string().max(100).optional().nullable() }) },
  async ({ user, params, body }) => resetPassword(user, params.id, body.newPassword),
);
