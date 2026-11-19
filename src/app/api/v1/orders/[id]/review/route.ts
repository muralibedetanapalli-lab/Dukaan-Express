import { api } from "@/server/http";
import { rateOrder, zReviewInput } from "@/server/services/review";

/** Customer rates a delivered order: the shop, and the Dukaan rider when one delivered it. Both feed the monthly star badges. */
export const POST = api({ roles: ["CUSTOMER"], body: zReviewInput }, async ({ user, params, body }) => rateOrder(user.customerId!, params.id, body));
