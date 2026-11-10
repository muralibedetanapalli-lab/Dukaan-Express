import { z } from "zod";
import { api } from "@/server/http";
import { cancelByCustomer } from "@/server/services/order";

export const POST = api(
  { roles: ["CUSTOMER"], body: z.object({ reason: z.string().trim().min(3).max(200) }) },
  async ({ user, params, body }) =>
    cancelByCustomer(params.id, { id: user.id, role: "CUSTOMER", customerId: user.customerId }, body.reason),
);
