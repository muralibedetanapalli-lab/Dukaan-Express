import { api } from "@/server/http";
import { markDealerPayoutPaid, zDealerMarkPaid } from "@/server/services/dealer";

/** Record the bank transfer of a dealer's commission payout. */
export const POST = api({ roles: ["SUPER_ADMIN"], body: zDealerMarkPaid }, async ({ user, params, body }) => markDealerPayoutPaid(user, params.id, body));
