import { api } from "@/server/http";
import { activeShopFor } from "@/server/services/inventory";
import { cancelPayout } from "@/server/services/payout";

export const POST = api({ roles: ["SHOP_OWNER"] }, async ({ user, params }) => {
  const { shop } = await activeShopFor(user);
  return cancelPayout(user, shop.id, params.id);
});
