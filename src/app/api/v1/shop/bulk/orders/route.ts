import { api } from "@/server/http";
import { placeBulkOrder, zPlaceBulk } from "@/server/services/bulk";

/** Place a bulk order with a wholesaler shop. Online orders wait for payment; pay-on-delivery orders go to the seller. */
export const POST = api({ roles: ["SHOP_OWNER"], body: zPlaceBulk, rateLimit: { name: "bulk-place", limit: 20 } }, async ({ user, body }) =>
  placeBulkOrder(user, body),
);
