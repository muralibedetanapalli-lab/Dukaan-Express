import Link from "next/link";
import { AlertTriangle, Boxes, CheckCircle2, ChefHat, ClipboardList, IndianRupee, Inbox, PackageCheck, PackageOpen } from "lucide-react";
import { getSessionUser } from "@/server/auth/session";
import { activeShopFor } from "@/server/services/inventory";
import { shopDashboard } from "@/server/services/dashboard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard, EmptyState } from "@/components/shared/misc";
import { OrderStatusBadge } from "@/components/shared/status-badge";
import { formatINR } from "@/lib/money";
import { fmtAgo } from "@/lib/format";

export const metadata = { title: "Shop dashboard" };

export default async function ShopDashboardPage() {
  const user = (await getSessionUser())!;
  const { shop } = await activeShopFor(user);
  const d = await shopDashboard(shop.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Today at {shop.name}</h1>
        <p className="text-sm text-muted-foreground">Live view of your orders and stock</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Today's orders" value={d.todayOrders} icon={ClipboardList} tone="primary" />
        <StatCard label="Today's revenue" value={formatINR(d.todayRevenue)} hint={`Your earning ${formatINR(d.todayEarning)}`} icon={IndianRupee} tone="success" />
        <StatCard label="New (pending)" value={d.pending} icon={Inbox} tone={d.pending ? "warning" : "default"} href="/shop/orders?tab=new" />
        <StatCard label="Confirmed" value={d.confirmed} icon={CheckCircle2} href="/shop/orders?tab=active" />
        <StatCard label="Preparing" value={d.preparing} icon={ChefHat} href="/shop/orders?tab=active" />
        <StatCard label="To be packed" value={d.toPack} icon={PackageOpen} href="/shop/orders?tab=active" />
        <StatCard label="Packed / dispatch" value={d.packed} icon={PackageCheck} href="/shop/orders?tab=dispatch" />
        <StatCard label="Completed" value={d.completed} icon={CheckCircle2} tone="success" href="/shop/orders?tab=completed" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="gap-0 p-0">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="font-semibold">Active orders</p>
            <Button asChild variant="ghost" size="sm">
              <Link href="/shop/orders">View all</Link>
            </Button>
          </div>
          {d.activeOrders.length === 0 ? (
            <EmptyState icon={Inbox} title="No active orders" description="New orders appear here instantly with a sound alert." className="m-4 border-0" />
          ) : (
            <ul className="divide-y">
              {d.activeOrders.map((o) => (
                <li key={o.id}>
                  <Link href={`/shop/orders/${o.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50">
                    <div className="min-w-0">
                      <p className="font-semibold">{o.orderNumber}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {o.items.reduce((s, i) => s + i.quantity, 0)} items · {formatINR(o.total)} · {fmtAgo(o.createdAt)}
                      </p>
                    </div>
                    <OrderStatusBadge status={o.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="space-y-4">
          <StatCard label="Total products" value={d.totalProducts} icon={Boxes} href="/shop/inventory" />
          <Card className="gap-2 p-4">
            <p className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="size-4 text-amber-600" /> Low stock ({d.lowStockCount})
            </p>
            {d.lowStock.length === 0 ? (
              <p className="text-sm text-muted-foreground">All products are well stocked.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {d.lowStock.map((i) => (
                  <li key={i.id} className="flex justify-between gap-2">
                    <Link href={`/shop/inventory/${i.id}`} className="truncate hover:underline">
                      {i.name}
                    </Link>
                    <span className={i.stock === 0 ? "font-semibold text-destructive" : "font-semibold text-amber-700"}>{i.stock} left</span>
                  </li>
                ))}
              </ul>
            )}
            {d.lowStockCount > 0 && (
              <Button asChild variant="outline" size="sm" className="mt-1">
                <Link href="/shop/inventory?filter=low">Restock</Link>
              </Button>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
