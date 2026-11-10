import { IndianRupee, Percent, Receipt, Wallet } from "lucide-react";
import { getSessionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { activeShopFor } from "@/server/services/inventory";
import { getSettings } from "@/server/services/settings";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, StatCard } from "@/components/shared/misc";
import { Pill } from "@/components/shared/status-badge";
import { bpsToPercent, formatINR } from "@/lib/money";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Earnings" };

export default async function EarningsPage() {
  const user = (await getSessionUser())!;
  const { shop } = await activeShopFor(user);
  const settings = await getSettings();
  const [unsettled, settlements, recent] = await Promise.all([
    db.commission.aggregate({ where: { shopId: shop.id, settlementId: null }, _sum: { shopEarning: true, amount: true, baseAmount: true }, _count: true }),
    db.shopSettlement.findMany({ where: { shopId: shop.id }, orderBy: { periodEnd: "desc" }, take: 24 }),
    db.commission.findMany({ where: { shopId: shop.id }, include: { order: { select: { orderNumber: true } } }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  return (
    <div className="space-y-5">
      <PageHeader title="Earnings" description={`Platform commission: ${bpsToPercent(shop.commissionBps ?? settings.commission.defaultBps)} of item value after coupons`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Unsettled orders" value={unsettled._count} icon={Receipt} />
        <StatCard label="Gross sales" value={formatINR(unsettled._sum.baseAmount ?? 0)} icon={IndianRupee} />
        <StatCard label="Commission" value={formatINR(unsettled._sum.amount ?? 0)} icon={Percent} tone="warning" />
        <StatCard label="Payable to you" value={formatINR(unsettled._sum.shopEarning ?? 0)} icon={Wallet} tone="success" />
      </div>
      <Card className="gap-0 p-0">
        <p className="border-b px-4 py-3 font-semibold">Settlements</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead className="text-right">Commission</TableHead>
              <TableHead className="text-right">Net payable</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {settlements.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No settlements yet
                </TableCell>
              </TableRow>
            )}
            {settlements.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  {fmtDate(s.periodStart)} – {fmtDate(s.periodEnd)}
                </TableCell>
                <TableCell className="text-right">{s.orderCount}</TableCell>
                <TableCell className="text-right">{formatINR(s.grossSales)}</TableCell>
                <TableCell className="text-right">{formatINR(s.commissionAmount)}</TableCell>
                <TableCell className="text-right font-semibold">{formatINR(s.netPayable)}</TableCell>
                <TableCell>
                  <Pill tone={s.status === "PAID" ? "success" : "warning"}>{s.status.toLowerCase()}</Pill>
                  {s.reference && <span className="ml-2 text-xs text-muted-foreground">{s.reference}</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <Card className="gap-0 p-0">
        <p className="border-b px-4 py-3 font-semibold">Recent delivered orders</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Base</TableHead>
              <TableHead className="text-right">Commission</TableHead>
              <TableHead className="text-right">You earn</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recent.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.order.orderNumber}</TableCell>
                <TableCell>{fmtDate(c.createdAt)}</TableCell>
                <TableCell className="text-right">{formatINR(c.baseAmount)}</TableCell>
                <TableCell className="text-right">
                  {formatINR(c.amount)} <span className="text-xs text-muted-foreground">({bpsToPercent(c.rateBps)})</span>
                </TableCell>
                <TableCell className="text-right font-semibold text-primary">{formatINR(c.shopEarning)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
