import { api } from "@/server/http";
import { zBankInput } from "@/server/services/payout";
import { requireRider } from "@/server/services/delivery";
import { getRiderBank, saveRiderBank } from "@/server/services/rider";

export const GET = api({ roles: ["RIDER"] }, async ({ user }) => ({ bankAccount: await getRiderBank(requireRider(user)) }));

export const PATCH = api({ roles: ["RIDER"], body: zBankInput, rateLimit: { name: "bank-account", limit: 10 } }, async ({ user, body }) => ({
  bankAccount: await saveRiderBank(user, body),
}));
