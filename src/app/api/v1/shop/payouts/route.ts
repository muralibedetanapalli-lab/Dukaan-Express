import { api } from "@/server/http";
import { activeShopFor } from "@/server/services/inventory";
import { payoutOverview, requestPayout } from "@/server/services/payout";

/** Available balance (after platform commission), bank account (masked), open request and payout history. */
export const GET = api({ roles: ["SHOP_OWNER"] }, async ({ user }) => {
  const { shop } = await activeShopFor(user);
  return payoutOverview(shop.id);
});

/** Request a transfer of the whole available balance. The admin is notified. */
export const POST = api({ roles: ["SHOP_OWNER"], rateLimit: { name: "payout-request", limit: 5 } }, async ({ user }) => {
  const { shop } = await activeShopFor(user);
  return requestPayout(user, shop.id);
});
