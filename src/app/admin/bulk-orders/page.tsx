import Link from "next/link";
import { CheckCircle2, Clock, IndianRupee, Warehouse } from "lucide-react";
import { db } from "@/server/db";
import { getSettings } from "@/server/services/settings";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader, StatCard } from "@/components/shared/misc";
import { Pill } from "@/components/shared/status-badge";
import { BULK_FULFILMENT_LABEL, BULK_STATUS, type BulkStatus } from "@/lib/bulk";
import { bpsToPercent, formatINR } from "@/lib/money";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Bulk (B2B) orders" };
export const dynamic = "force-dynamic";

const OPEN: BulkStatus[] = ["PLACED", "ACCEPTED", "DISPATCHED", "READY_FOR_PICKUP"];

export default async function AdminBulkOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const status = sp.status && sp.status in BULK_STATUS ? (sp.status as BulkStatus) : sp.status === "open" ? "open" : null;
  const [orders, done, open, wholesalers, refundIssues, settings] = await Promise.all([
    db.bulkOrder.findMany({
      where: status === "open" ? { status: { in: OPEN } } : status ? { status } : {},
      include: { buyerShop: { select: { name: true } }, sellerShop: { select: { name: true } }, commission: { select: { amount: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.commission.aggregate({ where: { bulkOrderId: { not: null } }, _sum: { baseAmount: true, amount: true }, _count: true }),
    db.bulkOrder.count({ where: { status: { in: OPEN } } }),
    db.shop.count({ where: { sellsBulk: true, deletedAt: null } }),
    db.bulkOrder.count({ where: { refundStatus: "FAILED" } }),
    getSettings(),
  ]);
  const filters: [string, string][] = [
    ["", "All"],
    ["open", "Open"],
    ["PAYMENT_PENDING", "Awaiting payment"],
    ["DELIVERED", "Completed"],
    ["REJECTED", "Rejected"],
    ["CANCELLED", "Cancelled"],
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bulk (B2B) orders"
        description={`Shop-to-shop wholesale orders · commission ${bpsToPercent(settings.commission.b2bBps)} on item value (change it in Settings → Commission)`}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Completed" value={done._count} icon={CheckCircle2} tone="success" />
        <StatCard label="Bulk sales" value={formatINR(done._sum.baseAmount ?? 0, { compact: true })} icon={IndianRupee} tone="primary" />
        <StatCard label="B2B commission" value={formatINR(done._sum.amount ?? 0, { compact: true })} icon={IndianRupee} />
        <StatCard label="Open orders" value={open} hint={`${wholesalers} wholesaler${wholesalers === 1 ? "" : "s"}`} icon={Clock} />
      </div>
      {refundIssues > 0 && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
          {refundIssues} bulk order refund(s) failed at Cashfree. Open them below and refund manually.
        </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {filters.map(([k, label]) => (
          <Link
            key={k}
            href={k ? `/admin/bulk-orders?status=${k}` : "/admin/bulk-orders"}
            className={cn(
              "rounded-full border px-3 py-1 text-sm font-medium",
              (status ?? "") === k ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {label}
          </Link>
        ))}
      </div>

      {orders.length === 0 ? (
        <EmptyState icon={Warehouse} title="No bulk orders" description="When shops order from wholesaler shops, the orders show up here." />
      ) : (
        <Card className="gap-0 overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Seller → Buyer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>How</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Commission</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <Link href={`/admin/bulk-orders/${o.id}`} className="font-semibold text-primary hover:underline">
                      {o.number}
                    </Link>
                    <p className="text-xs text-muted-foreground">{fmtDateTime(o.createdAt)}</p>
                  </TableCell>
                  <TableCell className="text-sm">
                    {o.sellerShop.name} → {o.buyerShop.name}
                  </TableCell>
                  <TableCell>
                    <Pill tone={BULK_STATUS[o.status].tone}>{BULK_STATUS[o.status].label}</Pill>
                    {o.refundStatus === "FAILED" && <Pill tone="danger">refund failed</Pill>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {BULK_FULFILMENT_LABEL[o.fulfilment]}
                    <br />
                    {o.paymentMethod === "ONLINE" ? "Online" : "On delivery"}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatINR(o.total)}</TableCell>
                  <TableCell className="text-right tabular-nums">{o.commission ? formatINR(o.commission.amount) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
