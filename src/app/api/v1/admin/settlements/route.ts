import { z } from "zod";
import { api } from "@/server/http";
import { db } from "@/server/db";
import { generateSettlement, revealBankAccount } from "@/server/services/payout";

export const GET = api({ roles: ["SUPER_ADMIN"], query: z.object({ shopId: z.string().optional() }) }, async ({ query }) => {
  const [settlements, unsettled] = await Promise.all([
    db.shopSettlement.findMany({
      where: query.shopId ? { shopId: query.shopId } : {},
      include: { shop: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.commission.groupBy({
      by: ["shopId"],
      where: { settlementId: null },
      _sum: { baseAmount: true, amount: true, shopEarning: true },
      _count: true,
    }),
  ]);
  const shops = await db.shop.findMany({ where: { id: { in: unsettled.map((u) => u.shopId) } }, select: { id: true, name: true, commissionBps: true } });
  const name = new Map(shops.map((s) => [s.id, s]));
  // Open payouts carry the full bank details the admin needs to make the transfer.
  const openShopIds = [...new Set(settlements.filter((s) => s.status === "PENDING" || s.status === "PROCESSING").map((s) => s.shopId))];
  const banks = new Map(await Promise.all(openShopIds.map(async (id) => [id, await revealBankAccount(id)] as const)));
  return {
    settlements: settlements.map((s) => ({ ...s, payoutAccount: banks.get(s.shopId) ?? null })),
    unsettled: unsettled.map((u) => ({
      shopId: u.shopId,
      shopName: name.get(u.shopId)?.name ?? u.shopId,
      orders: u._count,
      gross: u._sum.baseAmount ?? 0,
      commission: u._sum.amount ?? 0,
      payable: u._sum.shopEarning ?? 0,
    })),
  };
});

export const POST = api(
  { roles: ["SUPER_ADMIN"], body: z.object({ shopId: z.string().min(1), periodStart: z.coerce.date(), periodEnd: z.coerce.date() }) },
  async ({ user, body }) => generateSettlement(user, body.shopId, body.periodStart, body.periodEnd),
);
