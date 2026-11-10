import Link from "next/link";
import { db } from "@/server/db";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/misc";
import { OrderStatusBadge, PaymentBadge, ShipmentStatusBadge } from "@/components/shared/status-badge";
import { Pagination } from "@/components/shared/pagination";
import { RealtimeListener } from "@/components/shared/realtime";
import { FilterBar } from "@/components/admin/filter-bar";
import { ORDER_STATUSES, STATUS_META, type OrderStatusKey } from "@/lib/order-status";
import { formatINR } from "@/lib/money";
import { fmtDateTime } from "@/lib/format";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Orders" };

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = 25;
  const status = ORDER_STATUSES.includes(sp.status as OrderStatusKey) ? (sp.status as OrderStatusKey) : undefined;
  const where: Prisma.OrderWhereInput = {
    ...(status ? { status } : {}),
    ...(sp.shopId ? { shopId: sp.shopId } : {}),
    ...(sp.payment ? { paymentStatus: sp.payment as Prisma.OrderWhereInput["paymentStatus"] & string } : {}),
    ...(sp.q ? { OR: [{ orderNumber: { contains: sp.q.toUpperCase() } }, { contactName: { contains: sp.q, mode: "insensitive" } }, { contactPhone: { contains: sp.q } }] } : {}),
    ...(sp.from || sp.to
      ? { createdAt: { ...(sp.from ? { gte: new Date(sp.from) } : {}), ...(sp.to ? { lte: new Date(`${sp.to}T23:59:59`) } : {}) } }
      : {}),
  };
  const [orders, total, shops] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { shop: { select: { name: true } }, shipment: { select: { status: true } } },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.order.count({ where }),
    db.shop.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <RealtimeListener />
      <PageHeader title="Orders" description="All orders across every shop" />
      <FilterBar
        basePath="/admin/orders"
        filters={[
          { key: "q", label: "Order #, customer name or phone", type: "search" },
          { key: "status", label: "Statuses", type: "select", options: ORDER_STATUSES.map((s) => ({ value: s, label: STATUS_META[s].label })) },
          { key: "shopId", label: "Shops", type: "select", options: shops.map((s) => ({ value: s.id, label: s.name })) },
          { key: "payment", label: "Payments", type: "select", options: ["PENDING", "CAPTURED", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"].map((p) => ({ value: p, label: p.replace("_", " ").toLowerCase() })) },
          { key: "from", label: "From", type: "date" },
          { key: "to", label: "To", type: "date" },
        ]}
      />
      <Card className="gap-0 overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Placed</TableHead>
              <TableHead>Shop</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Delivery</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  No orders match these filters
                </TableCell>
              </TableRow>
            )}
            {orders.map((o) => (
              <TableRow key={o.id}>
                <TableCell>
                  <Link href={`/admin/orders/${o.id}`} className="font-semibold text-primary hover:underline">
                    {o.orderNumber}
                  </Link>
                </TableCell>
                <TableCell className="text-xs whitespace-nowrap">{fmtDateTime(o.createdAt)}</TableCell>
                <TableCell>{o.shop.name}</TableCell>
                <TableCell>
                  <p>{o.contactName}</p>
                  <p className="text-xs text-muted-foreground">{o.contactPhone}</p>
                </TableCell>
                <TableCell>
                  <OrderStatusBadge status={o.status} />
                </TableCell>
                <TableCell>
                  <PaymentBadge status={o.paymentStatus} method={o.paymentMethod} />
                  <p className="mt-0.5 text-xs text-muted-foreground">{o.paymentMethod}</p>
                </TableCell>
                <TableCell>{o.shipment ? <ShipmentStatusBadge status={o.shipment.status} /> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-right font-semibold">{formatINR(o.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <Pagination page={page} pageSize={pageSize} total={total} basePath="/admin/orders" params={{ q: sp.q, status: sp.status, shopId: sp.shopId, payment: sp.payment, from: sp.from, to: sp.to }} />
    </div>
  );
}
