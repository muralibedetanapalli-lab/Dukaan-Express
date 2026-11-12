import { CheckCircle2, Clock, ExternalLink, Wallet } from "lucide-react";
import { getSessionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { activeShopFor } from "@/server/services/inventory";
import { payoutOverview } from "@/server/services/payout";
import { getSettings } from "@/server/services/settings";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, StatCard } from "@/components/shared/misc";
import { Pill } from "@/components/shared/status-badge";
import { bpsToPercent, formatINR } from "@/lib/money";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { payoutStatus } from "@/lib/payout";
import { BankAccountCard, CancelPayoutButton, RequestPayoutButton } from "./payout-client";

export const metadata = { title: "Earnings & payouts" };

export default async function EarningsPage() {
  const user = (await getSessionUser())!;
  const { shop } = await activeShopFor(user);
  const settings = await getSettings();
  const rate = bpsToPercent(shop.commissionBps ?? settings.commission.defaultBps);
  const [{ available, bank, open, payouts, paidOut }, recent, dealer] = await Promise.all([
    payoutOverview(shop.id),
    db.commission.findMany({ where: { shopId: shop.id }, include: { order: { select: { orderNumber: true } } }, orderBy: { createdAt: "desc" }, take: 30 }),
    shop.dealerId ? db.dealer.findUnique({ where: { id: shop.dealerId }, select: { user: { select: { name: true } } } }) : null,
  ]);
  const dealerName = dealer?.user.name ?? null;
  const disabledReason = open
    ? null
    : !bank
      ? "Add your bank account below to request payouts."
      : available.net <= 0
        ? "Nothing to withdraw yet. Earnings appear here once orders are delivered."
        : null;

  return (
    <div className="space-y-5">
      <PageHeader title="Earnings & payouts" description={`Platform commission is ${rate} of item value after coupons. Delivered orders add to your balance; request a payout any time.`} />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="gap-4 p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Wallet className="size-4" /> Available to withdraw
          </div>
          <p className="text-4xl font-bold tabular-nums text-primary">{formatINR(available.net)}</p>
          <dl className="grid gap-1.5 rounded-xl bg-muted/60 p-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">
                Item sales · {available.orders} delivered {available.orders === 1 ? "order" : "orders"}
              </dt>
              <dd className="tabular-nums">{formatINR(available.gross)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Platform commission</dt>
              <dd className="tabular-nums text-red-600 dark:text-red-400">− {formatINR(available.commission)}</dd>
            </div>
            <div className="flex justify-between border-t pt-1.5 font-semibold">
              <dt>You get</dt>
              <dd className="tabular-nums">{formatINR(available.net)}</dd>
            </div>
          </dl>
          {open ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
              <div className="text-sm">
                <p className="font-semibold">
                  {formatINR(open.netPayable)} payout{" "}
                  {open.status === "DEALER_REVIEW"
                    ? `waiting for ${dealerName ?? "your dealer"} to approve`
                    : open.status === "PENDING"
                      ? open.dealerReviewedAt
                        ? "approved by your dealer"
                        : "requested"
                      : "processing"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {fmtDateTime(open.createdAt)} · {open.orderCount} orders ·{" "}
                  {open.status === "DEALER_REVIEW" ? "once approved it goes to the platform for transfer" : "the admin will share transaction details once transferred"}
                </p>
              </div>
              {(open.status === "PENDING" || open.status === "DEALER_REVIEW") && open.requestedBy === "SHOP" && <CancelPayoutButton id={open.id} />}
            </div>
          ) : (
            <div>
              <RequestPayoutButton
                amount={available.net}
                orders={available.orders}
                bank={bank}
                disabledReason={disabledReason}
                reviewer={
                  dealerName
                    ? `${dealerName} (your dealer) checks it first, then the admin transfers it and shares the transaction details here.`
                    : undefined
                }
              />
            </div>
          )}
        </Card>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Paid out" value={formatINR(paidOut)} icon={CheckCircle2} tone="success" />
            <StatCard label="In progress" value={formatINR(open?.netPayable ?? 0)} icon={Clock} tone="warning" />
          </div>
          <BankAccountCard bank={bank} locked={!!open} />
        </div>
      </div>

      <Card className="gap-0 overflow-hidden p-0">
        <p className="border-b px-4 py-3 font-semibold">Payout history</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Requested</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead className="text-right">Sales</TableHead>
              <TableHead className="text-right">Commission</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Transaction details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payouts.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  No payouts yet
                </TableCell>
              </TableRow>
            )}
            {payouts.map((p) => {
              const st = payoutStatus(p.status);
              return (
                <TableRow key={p.id}>
                  <TableCell className="text-sm">
                    {fmtDate(p.createdAt)}
                    {p.requestedBy && <p className="text-xs text-muted-foreground">{p.requestedBy === "ADMIN" ? "Created by admin" : "Your request"}</p>}
                  </TableCell>
                  <TableCell className="text-right">{p.orderCount}</TableCell>
                  <TableCell className="text-right">{formatINR(p.grossSales)}</TableCell>
                  <TableCell className="text-right">{formatINR(p.commissionAmount)}</TableCell>
                  <TableCell className="text-right font-semibold">{formatINR(p.netPayable)}</TableCell>
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
                        {p.notes && <p className="text-muted-foreground">{p.notes}</p>}
                        {p.proofUrl && (
                          <a href={p.proofUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                            View receipt <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                    ) : p.status === "REJECTED" ? (
                      <p className="text-red-600 dark:text-red-400">
                        {p.dealerReviewedAt && p.dealerNote === p.rejectionReason ? "Declined by dealer: " : ""}
                        {p.rejectionReason}
                      </p>
                    ) : p.dealerReviewedAt ? (
                      <span className="text-muted-foreground">Approved by dealer {fmtDate(p.dealerReviewedAt)}</span>
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
              <TableHead>Delivered</TableHead>
              <TableHead className="text-right">Item value</TableHead>
              <TableHead className="text-right">Commission</TableHead>
              <TableHead className="text-right">You earn</TableHead>
              <TableHead>Payout</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recent.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No delivered orders yet
                </TableCell>
              </TableRow>
            )}
            {recent.map((c) => {
              const p = c.settlementId ? payouts.find((x) => x.id === c.settlementId) : null;
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.order.orderNumber}</TableCell>
                  <TableCell>{fmtDate(c.createdAt)}</TableCell>
                  <TableCell className="text-right">{formatINR(c.baseAmount)}</TableCell>
                  <TableCell className="text-right">
                    {formatINR(c.amount)} <span className="text-xs text-muted-foreground">({bpsToPercent(c.rateBps)})</span>
                  </TableCell>
                  <TableCell className="text-right font-semibold text-primary">{formatINR(c.shopEarning)}</TableCell>
                  <TableCell>{p ? <Pill tone={payoutStatus(p.status).tone}>{payoutStatus(p.status).label}</Pill> : <Pill>Available</Pill>}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
