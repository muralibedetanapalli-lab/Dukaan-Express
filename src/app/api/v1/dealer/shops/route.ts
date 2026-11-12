import { api } from "@/server/http";
import { dealerOnboardShop, zDealerShopInput } from "@/server/services/dealer";

/** Dealer onboards a shop in one of their regions: creates the owner login and the shop (live immediately). */
export const POST = api({ roles: ["DEALER"], body: zDealerShopInput, rateLimit: { name: "dealer-onboard", limit: 30 } }, async ({ user, body }) => dealerOnboardShop(user, body));
