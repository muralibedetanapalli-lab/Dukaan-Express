import { api } from "@/server/http";
import { db } from "@/server/db";
import { notFound } from "@/server/errors";
import { updateShop, zShopInput } from "@/server/services/admin";

export const GET = api({ roles: ["SUPER_ADMIN"] }, async ({ params }) => {
  const shop = await db.shop.findFirst({
    where: { id: params.id, deletedAt: null },
    include: {
      address: true,
      hours: { orderBy: { dayOfWeek: "asc" } },
      images: { orderBy: { sortOrder: "asc" } },
      category: true,
      owner: { include: { user: { select: { id: true, name: true, email: true, phone: true, status: true } } } },
    },
  });
  if (!shop) throw notFound("Shop");
  const [perf, delivered, inventoryCount, lowStock] = await Promise.all([
    db.order.aggregate({
      where: { shopId: shop.id, status: { notIn: ["CANCELLED", "SHOP_REJECTED", "PAYMENT_PENDING", "CREATED"] } },
      _sum: { total: true, commissionAmount: true, shopEarning: true },
      _count: true,
    }),
    db.order.count({ where: { shopId: shop.id, status: "DELIVERED" } }),
    db.shopInventory.count({ where: { shopId: shop.id, deletedAt: null } }),
    db.shopInventory.count({ where: { shopId: shop.id, deletedAt: null, stock: { lte: 5 } } }),
  ]);
  const rejected = await db.order.count({ where: { shopId: shop.id, status: "SHOP_REJECTED" } });
  return {
    shop,
    performance: {
      orders: perf._count,
      delivered,
      rejected,
      acceptanceRate: perf._count ? Math.round(((perf._count - rejected) / perf._count) * 100) : null,
      sales: perf._sum.total ?? 0,
      commission: perf._sum.commissionAmount ?? 0,
      earning: perf._sum.shopEarning ?? 0,
      inventoryCount,
      lowStock,
    },
  };
});

export const PATCH = api({ roles: ["SUPER_ADMIN"], body: zShopInput.partial() }, async ({ user, params, body }) =>
  updateShop(user, params.id, body),
);
