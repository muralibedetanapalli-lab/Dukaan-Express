import { api } from "@/server/http";
import { zBankInput } from "@/server/services/payout";
import { getDealerBank, requireDealer, saveDealerBank } from "@/server/services/dealer";

/** The dealer's own payout bank account (masked). */
export const GET = api({ roles: ["DEALER"] }, async ({ user }) => ({ bankAccount: await getDealerBank(requireDealer(user)) }));

export const PATCH = api({ roles: ["DEALER"], body: zBankInput, rateLimit: { name: "bank-account", limit: 10 } }, async ({ user, body }) => ({
  bankAccount: await saveDealerBank(user, body),
}));
