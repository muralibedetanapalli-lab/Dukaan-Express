import { z } from "zod";
import { api } from "@/server/http";
import { markSettlementPaid } from "@/server/services/admin";

export const POST = api(
  { roles: ["SUPER_ADMIN"], body: z.object({ reference: z.string().trim().min(3).max(80), notes: z.string().trim().max(300).optional().nullable() }) },
  async ({ user, params, body }) => markSettlementPaid(user, params.id, body.reference, body.notes),
);
