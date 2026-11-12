import { db } from "@/server/db";
import { getSettings } from "@/server/services/settings";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, StatCard } from "@/components/shared/misc";
import { Pill } from "@/components/shared/status-badge";
import { bpsToPercent, formatINR } from "@/lib/money";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { payoutStatus } from "@/lib/payout";
import { revealBankAccount } from "@/server/services/payout";
import { revealDealerBank } from "@/server/services/dealer";
import { CopyValue, GenerateSettlement, MarkPaid, RejectPayout } from "./finance-actions";

export const metadata = { title: "Commission & payouts" };

type RevealedBank = Awaited<ReturnType<typeof revealBankAccount>>;

/** Full bank details with copy buttons, for making the transfer. */
function BankDetails({ bank, missing }: { bank: RevealedBank; missing: string }) {
  if (!bank) return <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">{missing}</p>;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl bg-muted/60 p-3 text-sm">
      <div className="col-span-2">
        <dt className="text-xs text-muted-foreground">Account holder</dt>
        <dd className="font-medium">
          <CopyValue value={bank.accountHolderName} className="font-sans" />
        </dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Account number</dt>
        <dd>
          <CopyValue value={bank.accountNumber} />
        </dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">IFSC</dt>
        <dd>
          <CopyValue value={bank.ifsc} />
        </dd>
      </div>
      {bank.bankName && (
        <div>
          <dt className="text-xs text-muted-foreground">Bank</dt>
          <dd className="font-medium">{bank.bankName}</dd>
        </div>
      )}
      {bank.upiId && (
        <div>
          <dt className="text-xs text-muted-foreground">UPI</dt>
          <dd>
            <CopyValue value={bank.upiId} />
          </dd>
        </div>
      )}
    </dl>
  );
}

export default async function FinancePage() {
  const settings = await getSettings();
  const [unsettled, settlements, totals, shops, dealers, dealerPayouts] = await Promise.all([
    db.commission.groupBy({ by: ["shopId"], where: { settlementId: null }, _sum: { baseAmount: true, amount: true, shopEarning: true }, _count: true, _min: { createdAt: true }, _max: { createdAt: true } }),
    db.shopSettlement.findMany({ include: { shop: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.commission.aggregate({ _sum: { amount: true, shopEarning: true, baseAmount: true, dealerAmount: true } }),
    db.shop.findMany({ where: { deletedAt: null }, select: { id: true, name: true, commissionBps: true } }),
    db.dealer.findMany({ select: { id: true, user: { select: { name: true } } } }),
    db.dealerPayout.findMany({ include: { dealer: { select: { user: { select: { name: true } } } } }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const shopById = new Map(shops.map((s) => [s.id, s]));
  const dealerName = new Map(dealers.map((d) => [d.id, d.user.name ?? "Dealer"]));
  const paid = settlements.filter((s) => s.status === "PAID").reduce((a, s) => a + s.netPayable, 0);
  const openPayouts = settlements.filter((s) => s.status === "PENDING" || s.status === "PROCESSING").sort((a, b) => +a.createdAt - +b.createdAt);
  const withDealer = settlements.filter((s) => s.status === "DEALER_REVIEW").sort((a, b) => +a.createdAt - +b.createdAt);
  const history = settlements.filter((s) => !openPayouts.includes(s) && !withDealer.includes(s));
  const openDealerPayouts = dealerPayouts.filter((p) => p.status === "PENDING" || p.status === "PROCESSING");
  const dealerHistory = dealerPayouts.filter((p) => !openDealerPayouts.includes(p));
  // Full bank details are decrypted only for payouts waiting on a transfer.
  const [banks, dealerBanks] = await Promise.all([
    Promise.all([...new Set(openPayouts.map((p) => p.shopId))].map(async (id) => [id, await revealBankAccount(id)] as const)).then((e) => new Map(e)),
    Promise.all([...new Set(openDealerPayouts.map((p) => p.dealerId))].map(async (id) => [id, await revealDealerBank(id)] as const)).then((e) => new Map(e)),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader title="Commission & payouts" description={`Platform default commission ${bpsToPercent(settings.commission.defaultBps)} · charged on item value after coupons`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Gross item sales (delivered)" value={formatINR(totals._sum.baseAmount ?? 0, { compact: true })} />
        <StatCard label="Platform commission" value={formatINR(totals._sum.amount ?? 0, { compact: true })} tone="primary" />
        <StatCard label="Dealer share" value={formatINR(totals._sum.dealerAmount ?? 0, { compact: true })} hint="of platform commission" />
        <StatCard label="Shop earnings" value={formatINR(totals._sum.shopEarning ?? 0, { compact: true })} />
        <StatCard label="Paid out to shops" value={formatINR(paid, { compact: true })} tone="success" />
      </div>

      <Card className="gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="font-semibold">Payout requests</p>
          {openPayouts.length > 0 && <Pill tone="warning">{openPayouts.length} waiting</Pill>}
        </div>
        {openPayouts.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">No payout requests waiting</p>
        ) : (
          <div className="divide-y">
            {openPayouts.map((p) => (
              <div key={p.id} className="grid gap-4 p-4 md:grid-cols-[1fr_1.3fr_auto] md:items-center">
                <div>
                  <p className="font-semibold">{p.shop.name}</p>
                  <p className="text-2xl font-bold tabular-nums text-primary">{formatINR(p.netPayable)}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.orderCount} orders · sales {formatINR(p.grossSales)} − commission {formatINR(p.commissionAmount)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.requestedBy === "SHOP" ? "Requested by shop" : "Created by admin"} · {fmtDateTime(p.createdAt)}
                  </p>
                  {p.dealerReviewedAt && p.dealerId && (
                    <p className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      ✓ Approved by {dealerName.get(p.dealerId) ?? "dealer"} · {fmtDateTime(p.dealerReviewedAt)}
                      {p.dealerNote ? ` — “${p.dealerNote}”` : ""}
                    </p>
                  )}
                </div>
                <BankDetails bank={banks.get(p.shopId) ?? null} missing="This shop hasn't added a bank account yet." />
                <div className="flex gap-2 md:flex-col">
                  <MarkPaid id={p.id} amount={p.netPayable} shopName={p.shop.name} />
                  <RejectPayout id={p.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {withDealer.length > 0 && (
        <Card className="gap-0 overflow-hidden p-0">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="font-semibold">Waiting for dealer approval</p>
            <Pill>{withDealer.length}</Pill>
          </div>
          <div className="divide-y">
            {withDealer.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {p.shop.name} · <span className="tabular-nums">{formatINR(p.netPayable)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Dealer: {p.dealerId ? dealerName.get(p.dealerId) : "—"} · requested {fmtDateTime(p.createdAt)}
                  </p>
                </div>
                <RejectPayout id={p.id} />
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="font-semibold">Dealer commission payouts</p>
          {openDealerPayouts.length > 0 && <Pill tone="warning">{openDealerPayouts.length} waiting</Pill>}
        </div>
        {openDealerPayouts.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">No dealer payout requests waiting</p>
        ) : (
          <div className="divide-y">
            {openDealerPayouts.map((p) => (
              <div key={p.id} className="grid gap-4 p-4 md:grid-cols-[1fr_1.3fr_auto] md:items-center">
                <div>
                  <p className="font-semibold">{p.dealer.user.name}</p>
                  <p className="text-2xl font-bold tabular-nums text-primary">{formatINR(p.amount)}</p>
                  <p className="text-xs text-muted-foreground">
                    Commission share from {p.orderCount} delivered orders · {fmtDateTime(p.createdAt)}
                  </p>
                </div>
                <BankDetails bank={dealerBanks.get(p.dealerId) ?? null} missing="This dealer hasn't added a bank account yet." />
                <div className="flex gap-2 md:flex-col">
                  <MarkPaid id={p.id} amount={p.amount} shopName={p.dealer.user.name ?? "dealer"} base="/admin/dealer-payouts" />
                  <RejectPayout id={p.id} base="/admin/dealer-payouts" />
                </div>
              </div>
            ))}
          </div>
        )}
        {dealerHistory.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dealer</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Transaction</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dealerHistory.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-semibold">{p.dealer.user.name}</TableCell>
                  <TableCell className="text-xs">{fmtDate(p.createdAt)}</TableCell>
                  <TableCell className="text-right font-semibold">{formatINR(p.amount)}</TableCell>
                  <TableCell>
                    <Pill tone={payoutStatus(p.status).tone}>{payoutStatus(p.status).label}</Pill>
                    {p.status === "REJECTED" && p.rejectionReason && <p className="mt-0.5 max-w-48 text-xs text-muted-foreground">{p.rejectionReason}</p>}
                  </TableCell>
                  <TableCell className="text-xs">
                    {p.status === "PAID" && (
                      <p>
                        {p.payoutMethod ?? "Transfer"} · <span className="font-mono">{p.reference}</span> · {fmtDate(p.paidAt)}
                      </p>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

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
        <p className="border-b px-4 py-3 font-semibold">Payout history</p>
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
              <TableHead>Transaction</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  No payouts yet
                </TableCell>
              </TableRow>
            )}
            {history.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-semibold">
                  {s.shop.name}
                  {s.dealerReviewedAt && s.dealerId && <p className="text-xs font-normal text-muted-foreground">Dealer: {dealerName.get(s.dealerId)}</p>}
                </TableCell>
                <TableCell className="text-xs">
                  {fmtDate(s.periodStart)} – {fmtDate(s.periodEnd)}
                </TableCell>
                <TableCell className="text-right">{s.orderCount}</TableCell>
                <TableCell className="text-right">{formatINR(s.grossSales)}</TableCell>
                <TableCell className="text-right">{formatINR(s.commissionAmount)}</TableCell>
                <TableCell className="text-right font-semibold">{formatINR(s.netPayable)}</TableCell>
                <TableCell>
                  <Pill tone={payoutStatus(s.status).tone}>{payoutStatus(s.status).label}</Pill>
                  {s.status === "REJECTED" && s.rejectionReason && (
                    <p className="mt-0.5 max-w-48 text-xs text-muted-foreground">
                      {s.dealerReviewedAt && s.dealerNote === s.rejectionReason ? "By dealer: " : ""}
                      {s.rejectionReason}
                    </p>
                  )}
                </TableCell>
                <TableCell className="text-xs">
                  {s.status === "PAID" && (
                    <>
                      <p>
                        {s.payoutMethod ?? "Transfer"} · <span className="font-mono">{s.reference}</span>
                      </p>
                      <p className="text-muted-foreground">{fmtDate(s.paidAt)}</p>
                      {s.proofUrl && (
                        <a href={s.proofUrl} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                          Receipt
                        </a>
                      )}
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
