import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KeyValue, PageHeader } from "@/components/shared/misc";
import { OrderStatusBadge, Pill } from "@/components/shared/status-badge";
import { ActionButton } from "@/components/admin/action-button";
import { formatINR } from "@/lib/money";
import { fmtDate, fmtDateTime } from "@/lib/format";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await db.customer.findUnique({
    where: { id },
    include: {
      user: true,
      addresses: { where: { deletedAt: null } },
      orders: { orderBy: { createdAt: "desc" }, take: 100, include: { shop: { select: { name: true } } } },
      tickets: { orderBy: { createdAt: "desc" }, include: { order: { select: { orderNumber: true } } } },
    },
  });
  if (!c) notFound();
  const delivered = c.orders.filter((o) => o.status === "DELIVERED");
  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: "/admin/customers", label: "Customers" }}
        title={c.user.name ?? "Customer"}
        description={`+91 ${c.user.phone} · ${c.user.email ?? "no email"} · joined ${fmtDate(c.createdAt)}`}
        actions={
          <>
            <Pill tone={c.user.status === "ACTIVE" ? "success" : "danger"}>{c.user.status.toLowerCase()}</Pill>
            <ActionButton
              path={`/admin/customers/${c.id}`}
              method="PATCH"
              body={{ status: c.user.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }}
              variant={c.user.status === "ACTIVE" ? "outline" : "default"}
              confirm={c.user.status === "ACTIVE" ? { title: "Deactivate this customer?", description: "They will be signed out and blocked from logging in.", label: "Deactivate" } : undefined}
            >
              {c.user.status === "ACTIVE" ? "Deactivate" : "Activate"}
            </ActionButton>
          </>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="gap-0 overflow-hidden p-0">
          <p className="border-b px-4 py-3 font-semibold">Order history ({c.orders.length})</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Shop</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {c.orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <Link href={`/admin/orders/${o.id}`} className="font-semibold text-primary hover:underline">
                      {o.orderNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs">{fmtDateTime(o.createdAt)}</TableCell>
                  <TableCell>{o.shop.name}</TableCell>
                  <TableCell>
                    <OrderStatusBadge status={o.status} />
                  </TableCell>
                  <TableCell className="text-right">{formatINR(o.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        <div className="space-y-4">
          <Card className="gap-0 p-4">
            <p className="mb-2 font-semibold">Summary</p>
            <KeyValue label="Delivered orders">{delivered.length}</KeyValue>
            <KeyValue label="Lifetime spend">{formatINR(delivered.reduce((s, o) => s + o.total, 0))}</KeyValue>
            <KeyValue label="Cancelled">{c.orders.filter((o) => ["CANCELLED", "SHOP_REJECTED", "REFUNDED"].includes(o.status)).length}</KeyValue>
            <KeyValue label="Last login">{c.user.lastLoginAt ? fmtDateTime(c.user.lastLoginAt) : "—"}</KeyValue>
          </Card>
          <Card className="gap-2 p-4 text-sm">
            <p className="font-semibold">Addresses</p>
            {c.addresses.map((a) => (
              <p key={a.id} className="text-muted-foreground">
                <b className="text-foreground">{a.label}:</b> {a.line1}, {a.city} {a.pincode}
              </p>
            ))}
          </Card>
          <Card className="gap-2 p-4 text-sm">
            <p className="font-semibold">Complaints & tickets</p>
            {c.tickets.length === 0 && <p className="text-muted-foreground">None</p>}
            {c.tickets.map((t) => (
              <Link key={t.id} href="/admin/support" className="block rounded-lg border p-2 hover:bg-muted">
                <p className="font-medium">{t.subject}</p>
                <p className="text-xs text-muted-foreground">
                  {t.ticketNumber} · {t.status.toLowerCase()} {t.order ? `· ${t.order.orderNumber}` : ""}
                </p>
              </Link>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
