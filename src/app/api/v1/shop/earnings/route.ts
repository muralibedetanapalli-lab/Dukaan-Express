import { api } from "@/server/http";
import { db } from "@/server/db";
import { activeShopFor } from "@/server/services/inventory";

export const GET = api({ roles: ["SHOP_OWNER"] }, async ({ user }) => {
  const { shop } = await activeShopFor(user);
  const [unsettled, settlements, recent] = await Promise.all([
    db.commission.aggregate({ where: { shopId: shop.id, settlementId: null }, _sum: { shopEarning: true, amount: true, baseAmount: true }, _count: true }),
    db.shopSettlement.findMany({ where: { shopId: shop.id }, orderBy: { periodEnd: "desc" }, take: 24 }),
    db.commission.findMany({ where: { shopId: shop.id }, include: { order: { select: { orderNumber: true, deliveredAt: true } } }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  return {
    unsettled: {
      orders: unsettled._count,
      gross: unsettled._sum.baseAmount ?? 0,
      commission: unsettled._sum.amount ?? 0,
      payable: unsettled._sum.shopEarning ?? 0,
    },
    settlements,
    recent,
  };
});
