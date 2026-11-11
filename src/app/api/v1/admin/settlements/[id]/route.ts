import { api } from "@/server/http";
import { markSettlementPaid, zMarkPaid } from "@/server/services/payout";

/** Record the bank transfer: UTR / reference, method, date, optional receipt image URL and notes. */
export const POST = api({ roles: ["SUPER_ADMIN"], body: zMarkPaid }, async ({ user, params, body }) => markSettlementPaid(user, params.id, body));
