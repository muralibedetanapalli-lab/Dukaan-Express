import { db } from "@/server/db";
import { getSettings } from "@/server/services/settings";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, StatCard } from "@/components/shared/misc";
import { Pill } from "@/components/shared/status-badge";
import { bpsToPercent, formatINR } from "@/lib/money";
import { fmtDate } from "@/lib/format";
import { GenerateSettlement, MarkPaid } from "./finance-actions";

export const metadata = { title: "Commission & payouts" };

export default async function FinancePage() {
  const settings = await getSettings();
  const [unsettled, settlements, totals, shops] = await Promise.all([
    db.commission.groupBy({ by: ["shopId"], where: { settlementId: null }, _sum: { baseAmount: true, amount: true, shopEarning: true }, _count: true, _min: { createdAt: true }, _max: { createdAt: true } }),
    db.shopSettlement.findMany({ include: { shop: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.commission.aggregate({ _sum: { amount: true, shopEarning: true, baseAmount: true } }),
    db.shop.findMany({ where: { deletedAt: null }, select: { id: true, name: true, commissionBps: true } }),
  ]);
  const shopById = new Map(shops.map((s) => [s.id, s]));
  const paid = settlements.filter((s) => s.status === "PAID").reduce((a, s) => a + s.netPayable, 0);

  return (
    <div className="space-y-5">
      <PageHeader title="Commission & payouts" description={`Platform default commission ${bpsToPercent(settings.commission.defaultBps)} · charged on item value after coupons`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Gross item sales (delivered)" value={formatINR(totals._sum.baseAmount ?? 0, { compact: true })} />
        <StatCard label="Platform commission" value={formatINR(totals._sum.amount ?? 0, { compact: true })} tone="primary" />
        <StatCard label="Shop earnings" value={formatINR(totals._sum.shopEarning ?? 0, { compact: true })} />
        <StatCard label="Paid out" value={formatINR(paid, { compact: true })} tone="success" />
      </div>

      <Card className="gap-0 overflow-hidden p-0">
        <p className="border-b px-4 py-3 font-semibold">Unsettled balances by shop</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Shop</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead className="text-right">Commission</TableHead>
              <TableHead className="text-right">Payable</TableHead>
              <TableHead className="text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {unsettled.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  All delivered orders are settled
                </TableCell>
              </TableRow>
            )}
            {unsettled.map((u) => {
              const s = shopById.get(u.shopId);
              return (
                <TableRow key={u.shopId}>
                  <TableCell className="font-semibold">{s?.name}</TableCell>
                  <TableCell>{bpsToPercent(s?.commissionBps ?? settings.commission.defaultBps)}</TableCell>
                  <TableCell className="text-right">{u._count}</TableCell>
                  <TableCell className="text-right">{formatINR(u._sum.baseAmount ?? 0)}</TableCell>
                  <TableCell className="text-right">{formatINR(u._sum.amount ?? 0)}</TableCell>
                  <TableCell className="text-right font-semibold">{formatINR(u._sum.shopEarning ?? 0)}</TableCell>
                  <TableCell className="text-right">
                    <GenerateSettlement shopId={u.shopId} shopName={s?.name ?? ""} from={u._min.createdAt!.toISOString()} to={u._max.createdAt!.toISOString()} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Card className="gap-0 overflow-hidden p-0">
        <p className="border-b px-4 py-3 font-semibold">Settlement history</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Shop</TableHead>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead className="text-right">Commission</TableHead>
              <TableHead className="text-right">Net payable</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {settlements.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-semibold">{s.shop.name}</TableCell>
                <TableCell className="text-xs">
                  {fmtDate(s.periodStart)} – {fmtDate(s.periodEnd)}
                </TableCell>
                <TableCell className="text-right">{s.orderCount}</TableCell>
                <TableCell className="text-right">{formatINR(s.grossSales)}</TableCell>
                <TableCell className="text-right">{formatINR(s.commissionAmount)}</TableCell>
                <TableCell className="text-right font-semibold">{formatINR(s.netPayable)}</TableCell>
                <TableCell>
                  <Pill tone={s.status === "PAID" ? "success" : "warning"}>{s.status.toLowerCase()}</Pill>
                  {s.reference && <p className="mt-0.5 text-xs text-muted-foreground">{s.reference}</p>}
                </TableCell>
                <TableCell className="text-right">{s.status !== "PAID" && <MarkPaid id={s.id} />}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
