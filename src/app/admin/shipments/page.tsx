import Link from "next/link";
import { Bike, Clock, Store, Truck } from "lucide-react";
import { db } from "@/server/db";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, StatCard } from "@/components/shared/misc";
import { OrderStatusBadge, ShipmentStatusBadge } from "@/components/shared/status-badge";
import { Pagination } from "@/components/shared/pagination";
import { FilterBar } from "@/components/admin/filter-bar";
import { RealtimeListener } from "@/components/shared/realtime";
import { DELIVERY_MODE_LABEL, SHIPMENT_STATUS_LABEL } from "@/lib/order-status";
import { formatINR } from "@/lib/money";
import { fmtAgo } from "@/lib/format";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Deliveries" };

export default async function DeliveriesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = 25;
  const where: Prisma.ShipmentWhereInput = {
    ...(sp.status ? { status: sp.status as Prisma.ShipmentWhereInput["status"] & string } : {}),
    ...(sp.mode === "OWN" || sp.mode === "RIDER" || sp.mode === "SELF_BOOKED" ? { mode: sp.mode } : {}),
    ...(sp.failed === "true" ? { failedDeliveryCount: { gt: 0 } } : {}),
    ...(sp.q ? { order: { orderNumber: { contains: sp.q.toUpperCase() } } } : {}),
  };
  const [items, total, waiting, active, online, failed] = await Promise.all([
    db.shipment.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        order: { select: { id: true, orderNumber: true, status: true, shop: { select: { name: true } } } },
        rider: { select: { user: { select: { name: true, phone: true } } } },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.shipment.count({ where }),
    db.shipment.count({ where: { status: "CREATED", riderId: null } }),
    db.shipment.count({ where: { status: { in: ["COURIER_ASSIGNED", "OUT_FOR_DELIVERY"] } } }),
    db.rider.count({ where: { isOnline: true, user: { status: "ACTIVE" } } }),
    db.shipment.count({ where: { failedDeliveryCount: { gt: 0 } } }),
  ]);
  return (
    <div>
      <RealtimeListener />
      <PageHeader title="Deliveries" description="Rider and own-staff deliveries. Open an order to assign a rider or complete a delivery." />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Waiting for a rider" value={waiting} icon={Clock} tone={waiting ? "warning" : "default"} href="/admin/shipments?status=CREATED" />
        <StatCard label="On the road" value={active} icon={Truck} tone="primary" />
        <StatCard label="Riders online" value={online} icon={Bike} tone="success" href="/admin/riders" />
        <StatCard label="With failed attempts" value={failed} icon={Store} tone={failed ? "danger" : "default"} href="/admin/shipments?failed=true" />
      </div>
      <FilterBar
        basePath="/admin/shipments"
        filters={[
          { key: "q", label: "Order #", type: "search" },
          { key: "status", label: "Statuses", type: "select", options: Object.entries(SHIPMENT_STATUS_LABEL).map(([value, label]) => ({ value, label })) },
          { key: "mode", label: "Delivered by", type: "select", options: Object.entries(DELIVERY_MODE_LABEL).map(([value, label]) => ({ value, label })) },
          { key: "failed", label: "Failed attempts", type: "select", options: [{ value: "true", label: "With failed attempts" }] },
        ]}
      />
      <Card className="gap-0 overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Shop</TableHead>
              <TableHead>Delivered by</TableHead>
              <TableHead>Delivery</TableHead>
              <TableHead>Order status</TableHead>
              <TableHead className="text-right">Rider fee</TableHead>
              <TableHead className="text-right">Cash to collect</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  No deliveries
                </TableCell>
              </TableRow>
            )}
            {items.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <Link href={`/admin/orders/${s.order.id}`} className="font-semibold text-primary hover:underline">
                    {s.order.orderNumber}
                  </Link>
                </TableCell>
                <TableCell className="text-sm">{s.order.shop.name}</TableCell>
                <TableCell className="text-sm">
                  {s.mode === "OWN" ? "Shop staff" : s.mode === "SELF_BOOKED" ? "Booked by shop" : s.rider ? s.rider.user.name : s.status === "CREATED" ? <span className="text-amber-700">No rider yet</span> : <span className="text-muted-foreground">—</span>}
                  {s.rider?.user.phone && <p className="text-xs text-muted-foreground">{s.rider.user.phone}</p>}
                </TableCell>
                <TableCell>
                  <ShipmentStatusBadge status={s.status} />
                  {s.lastError && <p className="mt-0.5 max-w-48 truncate text-xs text-red-600">{s.lastError}</p>}
                </TableCell>
                <TableCell>
                  <OrderStatusBadge status={s.order.status} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{s.mode === "RIDER" ? formatINR(s.riderFee) : "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{s.codAmount ? formatINR(s.codAmount) : "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{fmtAgo(s.updatedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <Pagination page={page} pageSize={pageSize} total={total} basePath="/admin/shipments" params={sp} />
    </div>
  );
}
