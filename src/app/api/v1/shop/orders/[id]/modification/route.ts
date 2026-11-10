import { z } from "zod";
import { api } from "@/server/http";
import { requestModification } from "@/server/services/order";

/** Request an admin-approved reduction (e.g. an item went out of stock). Prices can never be changed. */
export const POST = api(
  {
    roles: ["SHOP_OWNER"],
    body: z.object({
      reason: z.string().trim().min(5).max(300),
      changes: z.array(z.object({ orderItemId: z.string().min(1), newQuantity: z.number().int().min(0) })).min(1).max(50),
    }),
  },
  async ({ user, params, body }) =>
    requestModification(params.id, { id: user.id, role: "SHOP_OWNER", shopOwnerId: user.shopOwnerId }, body),
);
