import { z } from "zod";
import { api } from "@/server/http";
import { reviewModification } from "@/server/services/order";

export const POST = api(
  { roles: ["SUPER_ADMIN"], body: z.object({ approve: z.boolean(), note: z.string().trim().max(300).optional().nullable() }) },
  async ({ user, params, body }) => reviewModification(params.id, { id: user.id, role: "SUPER_ADMIN" }, body.approve, body.note),
);
