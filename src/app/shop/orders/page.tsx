import Link from "next/link";
import { Inbox } from "lucide-react";
import { getSessionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { activeShopFor } from "@/server/services/inventory";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/misc";
import { OrderStatusBadge, PaymentBadge, ShipmentStatusBadge } from "@/components/shared/status-badge";
import { formatINR } from "@/lib/money";
import { fmtAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/generated/prisma/client";

export const metadata = { title: "Orders" };

const TABS: { key: string; label: string; statuses: OrderStatus[] }[] = [
  { key: "new", label: "New", statuses: ["SHOP_PENDING"] },
  { key: "active", label: "In progress", statuses: ["SHOP_ACCEPTED", "PREPARING", "READY_FOR_PACKING"] },
  { key: "dispatch", label: "Dispatch", statuses: ["PACKED", "SHIPMENT_CREATING", "SHIPMENT_CREATED", "COURIER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY"] },
  { key: "completed", label: "Delivered", statuses: ["DELIVERED"] },
  { key: "closed", label: "Cancelled", statuses: ["CANCELLED", "SHOP_REJECTED", "REFUND_PENDING", "REFUNDED", "DELIVERY_FAILED"] },
];

export default async function ShopOrdersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const user = (await getSessionUser())!;
  const { shop } = await activeShopFor(user);
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0];
  const [orders, counts] = await Promise.all([
    db.order.findMany({
      where: { shopId: shop.id, status: { in: tab.statuses } },
      orderBy: { createdAt: tab.key === "new" || tab.key === "active" ? "asc" : "desc" },
      take: 100,
      include: { items: { select: { productName: true, quantity: true } }, shipment: { select: { status: true } } },
    }),
    db.order.groupBy({ by: ["status"], where: { shopId: shop.id }, _count: true }),
  ]);
  const countFor = (t: (typeof TABS)[number]) => counts.filter((c) => t.statuses.includes(c.status)).reduce((s, c) => s + c._count, 0);

  return (
    <div>
      <h1 className="mb-3 text-xl font-bold">Orders</h1>
      <div className="scrollbar-none -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {TABS.map((t) => {
          const n = countFor(t);
          return (
            <Link
              key={t.key}
              href={`/shop/orders?tab=${t.key}`}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold",
                t.key === tab.key ? "border-primary bg-primary text-primary-foreground" : "bg-card",
              )}
            >
              {t.label}
              {n > 0 && t.key !== "completed" && t.key !== "closed" && (
                <span className={cn("rounded-full px-1.5 text-xs", t.key === tab.key ? "bg-white/25" : "bg-secondary text-primary")}>{n}</span>
              )}
            </Link>
          );
        })}
      </div>
      {orders.length === 0 ? (
        <EmptyState icon={Inbox} title={`No ${tab.label.toLowerCase()} orders`} />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {orders.map((o) => (
            <Link key={o.id} href={`/shop/orders/${o.id}`}>
              <Card className={cn("gap-2 p-4 transition hover:shadow-md", o.status === "SHOP_PENDING" && "border-amber-400 ring-2 ring-amber-200")}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{o.orderNumber}</p>
                    <p className="text-xs text-muted-foreground">{fmtAgo(o.createdAt)}</p>
                  </div>
                  <OrderStatusBadge status={o.status} />
                </div>
                <p className="line-clamp-2 text-sm text-muted-foreground">{o.items.map((i) => `${i.quantity}× ${i.productName}`).join(", ")}</p>
                <div className="flex items-center justify-between">
                  <span className="font-bold">{formatINR(o.total)}</span>
                  <span className="flex gap-1">
                    {o.shipment && <ShipmentStatusBadge status={o.shipment.status} />}
                    <PaymentBadge status={o.paymentStatus} method={o.paymentMethod} />
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
