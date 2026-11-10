import { AlertOctagon, Ban, CheckCircle2, ClipboardList, Clock, IndianRupee, Package, Store, TrendingUp, Truck, Users, Wallet } from "lucide-react";
import { adminDashboard, salesSeries, type Granularity } from "@/server/services/dashboard";
import { Card } from "@/components/ui/card";
import { PageHeader, StatCard } from "@/components/shared/misc";
import { OrderStatusBadge, ShipmentStatusBadge } from "@/components/shared/status-badge";
import { formatINR } from "@/lib/money";
import { SalesChart } from "./sales-chart";

export const metadata = { title: "Admin dashboard" };

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ g?: string }> }) {
  const sp = await searchParams;
  const g: Granularity = sp.g === "weekly" || sp.g === "monthly" ? sp.g : "daily";
  const [s, series] = await Promise.all([adminDashboard(), salesSeries(g)]);

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Platform-wide performance at a glance" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total sales" value={formatINR(s.totalSales, { compact: true })} icon={TrendingUp} tone="success" />
        <StatCard label="Platform revenue" value={formatINR(s.platformRevenue, { compact: true })} hint={`+ ${formatINR(s.deliveryFeesCollected, { compact: true })} delivery fees`} icon={Wallet} tone="primary" />
        <StatCard label="Total orders" value={s.orders} hint={`${s.todayOrders} today`} icon={ClipboardList} href="/admin/orders" />
        <StatCard label="Pending orders" value={s.pendingOrders} hint={`${s.inProgressOrders} in progress`} icon={Clock} tone="warning" href="/admin/orders?status=SHOP_PENDING" />
        <StatCard label="Completed" value={s.completedOrders} icon={CheckCircle2} tone="success" href="/admin/orders?status=DELIVERED" />
        <StatCard label="Cancelled" value={s.cancelledOrders} icon={Ban} tone="danger" href="/admin/orders?status=CANCELLED" />
        <StatCard label="Customers" value={s.customers} icon={Users} href="/admin/customers" />
        <StatCard label="Shops onboarded" value={s.shops} hint={s.pendingShops ? `${s.pendingShops} awaiting approval` : undefined} icon={Store} href="/admin/shops" />
        <StatCard label="Active shops" value={s.activeShops} icon={Store} tone="success" href="/admin/shops?active=true" />
        <StatCard label="Products" value={s.products} icon={Package} href="/admin/products" />
        <StatCard label="Shipment exceptions" value={s.shipmentExceptions} icon={AlertOctagon} tone={s.shipmentExceptions ? "danger" : "default"} href="/admin/shipments?status=EXCEPTION" />
        <StatCard label="Avg order value" value={formatINR(s.completedOrders ? Math.round(s.totalSales / Math.max(1, s.orders - s.cancelledOrders)) : 0)} icon={IndianRupee} />
      </div>

      <Card className="p-5">
        <SalesChart data={series} granularity={g} />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="gap-3 p-5">
          <p className="font-semibold">Orders by status</p>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {s.statusBreakdown
              .sort((a, b) => b.count - a.count)
              .map((x) => (
                <li key={x.status} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                  <OrderStatusBadge status={x.status} />
                  <span className="font-bold tabular-nums">{x.count}</span>
                </li>
              ))}
          </ul>
        </Card>
        <Card className="gap-3 p-5">
          <p className="flex items-center gap-2 font-semibold">
            <Truck className="size-4" /> Delivery status
          </p>
          {s.shipments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No shipments yet.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {s.shipments.map((x) => (
                <li key={x.status} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                  <ShipmentStatusBadge status={x.status} />
                  <span className="font-bold tabular-nums">{x.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
