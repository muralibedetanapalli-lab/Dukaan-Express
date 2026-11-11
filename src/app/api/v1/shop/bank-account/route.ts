import { api } from "@/server/http";
import { activeShopFor } from "@/server/services/inventory";
import { getBankAccount, saveBankAccount, zBankInput } from "@/server/services/payout";

/** The active shop's payout bank account. The account number is only ever returned masked. */
export const GET = api({ roles: ["SHOP_OWNER"] }, async ({ user }) => {
  const { shop } = await activeShopFor(user);
  return { bankAccount: await getBankAccount(shop.id) };
});

export const PATCH = api({ roles: ["SHOP_OWNER"], body: zBankInput, rateLimit: { name: "bank-account", limit: 10 } }, async ({ user, body }) => {
  const { shop } = await activeShopFor(user);
  return { bankAccount: await saveBankAccount(user, shop.id, body) };
});
