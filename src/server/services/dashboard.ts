import "server-only";
import { startOfDay, subDays, startOfWeek, startOfMonth, format } from "date-fns";
import { db } from "@/server/db";
import { ACTIVE_SHOP_STATUSES } from "@/lib/order-status";
import type { OrderStatus } from "@/generated/prisma/client";

const NOT_SALES: OrderStatus[] = ["CANCELLED", "SHOP_REJECTED", "PAYMENT_PENDING", "CREATED", "REFUNDED", "REFUND_PENDING"];

export async function adminDashboard() {
  const today = startOfDay(new Date());
  const [
    customers,
    shops,
    activeShops,
    pendingShops,
    products,
    orders,
    byStatus,
    sales,
    revenue,
    deliveryFees,
    shipmentsByStatus,
    exceptions,
    todayOrders,
  ] = await Promise.all([
    db.customer.count(),
    db.shop.count({ where: { deletedAt: null } }),
    db.shop.count({ where: { deletedAt: null, isActive: true, approvalStatus: "APPROVED" } }),
    db.shop.count({ where: { deletedAt: null, approvalStatus: "PENDING" } }),
    db.product.count({ where: { deletedAt: null } }),
    db.order.count(),
    db.order.groupBy({ by: ["status"], _count: true }),
    db.order.aggregate({ where: { status: { notIn: NOT_SALES } }, _sum: { total: true } }),
    db.commission.aggregate({ _sum: { amount: true } }),
    db.order.aggregate({ where: { status: "DELIVERED" }, _sum: { deliveryFee: true } }),
    db.shipment.groupBy({ by: ["status"], _count: true }),
    db.shipment.count({ where: { status: "EXCEPTION" } }),
    db.order.count({ where: { createdAt: { gte: today } } }),
  ]);
  const count = (s: OrderStatus[]) => byStatus.filter((b) => s.includes(b.status)).reduce((a, b) => a + b._count, 0);
  return {
    customers,
    shops,
    activeShops,
    pendingShops,
    products,
    orders,
    todayOrders,
    pendingOrders: count(["PAYMENT_PENDING", "SHOP_PENDING", "PAYMENT_CONFIRMED"]),
    inProgressOrders: count(ACTIVE_SHOP_STATUSES.filter((s) => s !== "SHOP_PENDING") as OrderStatus[]) + count(["PICKED_UP", "OUT_FOR_DELIVERY"]),
    completedOrders: count(["DELIVERED"]),
    cancelledOrders: count(["CANCELLED", "SHOP_REJECTED", "REFUNDED", "REFUND_PENDING"]),
    totalSales: sales._sum.total ?? 0,
    platformRevenue: revenue._sum.amount ?? 0,
    deliveryFeesCollected: deliveryFees._sum.deliveryFee ?? 0,
    shipments: shipmentsByStatus.map((s) => ({ status: s.status, count: s._count })),
    shipmentExceptions: exceptions,
    statusBreakdown: byStatus.map((b) => ({ status: b.status, count: b._count })),
  };
}

export type Granularity = "daily" | "weekly" | "monthly";

/** Sales series for charts; buckets computed in SQL-free JS to stay DB-agnostic. */
export async function salesSeries(granularity: Granularity, shopId?: string) {
  const days = granularity === "daily" ? 30 : granularity === "weekly" ? 7 * 12 : 365;
  const since = startOfDay(subDays(new Date(), days - 1));
  const orders = await db.order.findMany({
    where: { createdAt: { gte: since }, status: { notIn: NOT_SALES }, ...(shopId ? { shopId } : {}) },
    select: { createdAt: true, total: true, commissionAmount: true, shopEarning: true },
  });
  const bucket = (d: Date) =>
    granularity === "daily"
      ? format(d, "yyyy-MM-dd")
      : granularity === "weekly"
        ? format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd")
        : format(startOfMonth(d), "yyyy-MM");
  const map = new Map<string, { sales: number; orders: number; commission: number; shopEarning: number }>();
  // Pre-fill buckets so charts show zero days
  for (let d = new Date(since); d <= new Date(); d = new Date(d.getTime() + 86400_000)) {
    const k = bucket(d);
    if (!map.has(k)) map.set(k, { sales: 0, orders: 0, commission: 0, shopEarning: 0 });
  }
  for (const o of orders) {
    const k = bucket(o.createdAt);
    const v = map.get(k) ?? { sales: 0, orders: 0, commission: 0, shopEarning: 0 };
    v.sales += o.total;
    v.orders += 1;
    v.commission += o.commissionAmount;
    v.shopEarning += o.shopEarning;
    map.set(k, v);
  }
  return [...map.entries()].map(([period, v]) => ({ period, ...v }));
}

export async function shopDashboard(shopId: string) {
  const today = startOfDay(new Date());
  const [byStatus, todayAgg, totalProducts, inventory, recent] = await Promise.all([
    db.order.groupBy({ by: ["status"], where: { shopId }, _count: true }),
    db.order.aggregate({
      where: { shopId, createdAt: { gte: today }, status: { notIn: NOT_SALES } },
      _sum: { total: true, shopEarning: true },
      _count: true,
    }),
    db.shopInventory.count({ where: { shopId, deletedAt: null } }),
    db.shopInventory.findMany({
      where: { shopId, deletedAt: null },
      select: { id: true, stock: true, lowStockThreshold: true, isAvailable: true, product: { select: { name: true } } },
    }),
    db.order.findMany({
      where: { shopId, status: { in: ACTIVE_SHOP_STATUSES as OrderStatus[] } },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { items: true },
    }),
  ]);
  const count = (s: OrderStatus) => byStatus.find((b) => b.status === s)?._count ?? 0;
  const lowStock = inventory.filter((i) => i.stock <= i.lowStockThreshold);
  return {
    todayOrders: todayAgg._count,
    todayRevenue: todayAgg._sum.total ?? 0,
    todayEarning: todayAgg._sum.shopEarning ?? 0,
    pending: count("SHOP_PENDING"),
    confirmed: count("SHOP_ACCEPTED"),
    preparing: count("PREPARING"),
    toPack: count("READY_FOR_PACKING"),
    packed: count("PACKED") + count("SHIPMENT_CREATING") + count("SHIPMENT_CREATED") + count("COURIER_ASSIGNED"),
    completed: count("DELIVERED"),
    totalProducts,
    lowStockCount: lowStock.length,
    lowStock: lowStock.slice(0, 8).map((i) => ({ id: i.id, name: i.product.name, stock: i.stock })),
    activeOrders: recent,
  };
}
