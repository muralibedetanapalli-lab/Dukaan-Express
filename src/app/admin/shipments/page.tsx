import Link from "next/link";
import { db } from "@/server/db";
import { integrationModes } from "@/server/env";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, SandboxBadge } from "@/components/shared/misc";
import { OrderStatusBadge, ShipmentStatusBadge } from "@/components/shared/status-badge";
import { Pagination } from "@/components/shared/pagination";
import { FilterBar } from "@/components/admin/filter-bar";
import { RealtimeListener } from "@/components/shared/realtime";
import { SHIPMENT_STATUS_LABEL } from "@/lib/order-status";
import { formatINR } from "@/lib/money";
import { fmtAgo } from "@/lib/format";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Deliveries" };

export default async function ShipmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = 25;
  const where: Prisma.ShipmentWhereInput = {
    ...(sp.status ? { status: sp.status as Prisma.ShipmentWhereInput["status"] & string } : {}),
    ...(sp.failed === "true" ? { failedDeliveryCount: { gt: 0 } } : {}),
    ...(sp.q ? { OR: [{ awbCode: { contains: sp.q } }, { order: { orderNumber: { contains: sp.q.toUpperCase() } } }, { shiprocketShipmentId: { contains: sp.q } }] } : {}),
  };
  const [items, total, exceptions, failed] = await Promise.all([
    db.shipment.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: { order: { select: { id: true, orderNumber: true, status: true, shop: { select: { name: true } } } } },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.shipment.count({ where }),
    db.shipment.count({ where: { status: "EXCEPTION" } }),
    db.shipment.count({ where: { failedDeliveryCount: { gt: 0 } } }),
  ]);
  return (
    <div>
      <RealtimeListener />
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            Deliveries {integrationModes().shiprocket === "mock" && <SandboxBadge label="Shiprocket sandbox" />}
          </span>
        }
        description={`${exceptions} exception(s) need attention · ${failed} shipment(s) with failed delivery attempts`}
      />
      <FilterBar
        basePath="/admin/shipments"
        filters={[
          { key: "q", label: "AWB, shipment ID or order #", type: "search" },
          { key: "status", label: "Statuses", type: "select", options: Object.entries(SHIPMENT_STATUS_LABEL).map(([value, label]) => ({ value, label })) },
          { key: "failed", label: "Failed attempts", type: "select", options: [{ value: "true", label: "With failed attempts" }] },
        ]}
      />
      <Card className="gap-0 overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Shop</TableHead>
              <TableHead>Shiprocket IDs</TableHead>
              <TableHead>AWB / courier</TableHead>
              <TableHead>Shipment</TableHead>
              <TableHead>Order status</TableHead>
              <TableHead className="text-right">Freight</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <Link href={`/admin/orders/${s.order.id}`} className="font-semibold text-primary hover:underline">
                    {s.order.orderNumber}
                  </Link>
                </TableCell>
                <TableCell>{s.order.shop.name}</TableCell>
                <TableCell className="font-mono text-xs">
                  {s.shiprocketShipmentId ?? "—"}
                  <br />
                  <span className="text-muted-foreground">{s.shiprocketOrderId}</span>
                </TableCell>
                <TableCell className="text-xs">
                  <span className="font-mono">{s.awbCode ?? "—"}</span>
                  <br />
                  {s.courierName}
                  {s.riderName && <span className="block text-muted-foreground">Rider: {s.riderName}</span>}
                </TableCell>
                <TableCell>
                  <ShipmentStatusBadge status={s.status} />
                  {s.failedDeliveryCount > 0 && <p className="mt-1 text-xs text-destructive">{s.failedDeliveryCount} failed attempt(s)</p>}
                  {s.status === "EXCEPTION" && <p className="mt-1 max-w-56 text-xs text-destructive">{s.lastError}</p>}
                </TableCell>
                <TableCell>
                  <OrderStatusBadge status={s.order.status} />
                </TableCell>
                <TableCell className="text-right">{s.freightCharge != null ? formatINR(s.freightCharge) : "—"}</TableCell>
                <TableCell className="text-xs">{fmtAgo(s.updatedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <Pagination page={page} pageSize={pageSize} total={total} basePath="/admin/shipments" params={{ q: sp.q, status: sp.status, failed: sp.failed }} />
    </div>
  );
}
