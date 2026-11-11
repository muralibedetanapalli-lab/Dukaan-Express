import { api } from "@/server/http";
import { db } from "@/server/db";
import { activeShopFor } from "@/server/services/inventory";
import { payoutOverview } from "@/server/services/payout";

export const GET = api({ roles: ["SHOP_OWNER"] }, async ({ user }) => {
  const { shop } = await activeShopFor(user);
  const [overview, recent] = await Promise.all([
    payoutOverview(shop.id),
    db.commission.findMany({ where: { shopId: shop.id }, include: { order: { select: { orderNumber: true, deliveredAt: true } } }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const { available, bank, open, payouts, paidOut } = overview;
  return {
    // `unsettled` kept for older app builds; same numbers as `available`.
    unsettled: { orders: available.orders, gross: available.gross, commission: available.commission, payable: available.net },
    available,
    bankAccount: bank,
    openPayout: open,
    paidOut,
    settlements: payouts,
    recent,
  };
});
