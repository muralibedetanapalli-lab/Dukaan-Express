import { CheckCircle2, Clock, ExternalLink, Wallet } from "lucide-react";
import { getSessionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { dealerBalance, getDealerBank } from "@/server/services/dealer";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, StatCard } from "@/components/shared/misc";
import { Pill } from "@/components/shared/status-badge";
import { bpsToPercent, formatINR } from "@/lib/money";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { payoutStatus } from "@/lib/payout";
import { BankAccountCard, CancelPayoutButton, RequestPayoutButton } from "@/app/shop/earnings/payout-client";

export const metadata = { title: "My earnings" };

export default async function DealerEarningsPage() {
  const user = (await getSessionUser())!;
  const dealerId = user.dealerId!;
  const [dealer, available, bank, payouts, paid, recent] = await Promise.all([
    db.dealer.findUniqueOrThrow({ where: { id: dealerId } }),
    dealerBalance(dealerId),
    getDealerBank(dealerId),
    db.dealerPayout.findMany({ where: { dealerId }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.dealerPayout.aggregate({ where: { dealerId, status: "PAID" }, _sum: { amount: true } }),
    db.commission.findMany({
      where: { dealerId, dealerAmount: { gt: 0 } },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { order: { select: { orderNumber: true } }, shop: { select: { name: true } } },
    }),
  ]);
  const open = payouts.find((p) => p.status === "PENDING" || p.status === "PROCESSING") ?? null;
  const disabledReason = !bank ? "Add your bank account below to request payouts." : available.amount <= 0 ? "Nothing to withdraw yet. You earn when your shops' orders are delivered." : null;

  return (
    <div className="space-y-5">
      <PageHeader title="My earnings" description={`You earn ${bpsToPercent(dealer.commissionShareBps)} of the platform commission on every delivered order from your shops.`} />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="gap-4 p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Wallet className="size-4" /> Available to withdraw
          </div>
          <p className="text-4xl font-bold tabular-nums text-primary">{formatINR(available.amount)}</p>
          <p className="text-sm text-muted-foreground">
            From {available.orders} delivered {available.orders === 1 ? "order" : "orders"} not yet paid out
          </p>
          {open ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
              <div className="text-sm">
                <p className="font-semibold">{formatINR(open.amount)} payout requested</p>
                <p className="text-xs text-muted-foreground">
                  {fmtDateTime(open.createdAt)} · the admin will share transaction details once transferred
                </p>
              </div>
              {open.status === "PENDING" && <CancelPayoutButton id={open.id} endpoint={`/dealer/earnings/payout/${open.id}/cancel`} />}
            </div>
          ) : (
            <div>
              <RequestPayoutButton amount={available.amount} orders={available.orders} bank={bank} disabledReason={disabledReason} endpoint="/dealer/earnings/payout" source="(your commission share)" />
            </div>
          )}
        </Card>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Paid out" value={formatINR(paid._sum.amount ?? 0)} icon={CheckCircle2} tone="success" />
            <StatCard label="In progress" value={formatINR(open?.amount ?? 0)} icon={Clock} tone="warning" />
          </div>
          <BankAccountCard bank={bank} locked={!!open} endpoint="/dealer/bank-account" />
        </div>
      </div>

      <Card className="gap-0 overflow-hidden p-0">
        <p className="border-b px-4 py-3 font-semibold">Payout history</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Requested</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Transaction details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payouts.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No payouts yet
                </TableCell>
              </TableRow>
            )}
            {payouts.map((p) => {
              const st = payoutStatus(p.status);
              return (
                <TableRow key={p.id}>
                  <TableCell className="text-sm">{fmtDate(p.createdAt)}</TableCell>
                  <TableCell className="text-right">{p.orderCount}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatINR(p.amount)}</TableCell>
                  <TableCell>
                    <Pill tone={st.tone}>{st.label}</Pill>
                  </TableCell>
                  <TableCell className="text-xs">
                    {p.status === "PAID" ? (
                      <div className="space-y-0.5">
                        <p>
                          <span className="font-semibold">{p.payoutMethod ?? "Transfer"}</span> · UTR <span className="font-mono">{p.reference}</span>
                        </p>
                        <p className="text-muted-foreground">Paid {p.paidAt ? fmtDateTime(p.paidAt) : ""}</p>
                        {p.proofUrl && (
                          <a href={p.proofUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                            View receipt <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                    ) : p.status === "REJECTED" ? (
                      <p className="text-red-600 dark:text-red-400">{p.rejectionReason}</p>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Card className="gap-0 overflow-hidden p-0">
        <p className="border-b px-4 py-3 font-semibold">Earnings per delivered order</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Shop</TableHead>
              <TableHead>Delivered</TableHead>
              <TableHead className="text-right">Platform commission</TableHead>
              <TableHead className="text-right">You earn</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recent.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No delivered orders yet
                </TableCell>
              </TableRow>
            )}
            {recent.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.order.orderNumber}</TableCell>
                <TableCell className="text-sm">{c.shop.name}</TableCell>
                <TableCell className="text-sm">{fmtDate(c.createdAt)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatINR(c.amount)}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums text-primary">{formatINR(c.dealerAmount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
