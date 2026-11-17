import { ExternalLink, Wallet } from "lucide-react";
import { getSessionUser } from "@/server/auth/session";
import { walletSummary } from "@/server/services/rider";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/shared/status-badge";
import { formatINR } from "@/lib/money";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { payoutStatus } from "@/lib/payout";
import { BankAccountCard, CancelPayoutButton, RequestPayoutButton } from "@/app/shop/earnings/payout-client";

export const metadata = { title: "Wallet" };

const ENTRY_LABEL: Record<string, string> = {
  DELIVERY_EARNING: "Delivery earning",
  COD_COLLECTED: "Cash collected (COD)",
  WITHDRAWAL: "Withdrawal",
  WITHDRAWAL_REVERSAL: "Withdrawal returned",
  ADJUSTMENT: "Adjustment",
};

export default async function RiderWalletPage() {
  const user = (await getSessionUser())!;
  const w = await walletSummary(user.riderId!);
  const disabledReason = w.open
    ? null
    : !w.bank
      ? "Add your bank account below to withdraw."
      : w.balance < 0
        ? `You hold ${formatINR(-w.balance)} more in collected cash than you've earned. It's settled from your next deliveries.`
        : w.balance === 0
          ? "Nothing to withdraw yet. Your delivery earnings appear here."
          : null;

  return (
    <div className="space-y-4">
      <Card className="gap-3 p-5">
        <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Wallet className="size-4" /> Wallet balance
        </p>
        <p className={`text-4xl font-bold tabular-nums ${w.balance < 0 ? "text-red-600" : "text-primary"}`}>{formatINR(w.balance)}</p>
        <dl className="grid gap-1 rounded-xl bg-muted/60 p-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Earned · {w.deliveries} deliveries</dt>
            <dd className="tabular-nums">{formatINR(w.earned)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Cash you collected (COD)</dt>
            <dd className="tabular-nums text-red-600 dark:text-red-400">− {formatINR(w.cashCollected)}</dd>
          </div>
        </dl>
        {w.open ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
            <div className="text-sm">
              <p className="font-semibold">
                {formatINR(w.open.amount)} withdrawal {w.open.status === "DEALER_REVIEW" ? "waiting for your dealer" : "approved — transfer pending"}
              </p>
              <p className="text-xs text-muted-foreground">Requested {fmtDateTime(w.open.createdAt)}</p>
            </div>
            {(w.open.status === "DEALER_REVIEW" || w.open.status === "PENDING") && <CancelPayoutButton id={w.open.id} endpoint={`/rider/withdrawals/${w.open.id}/cancel`} />}
          </div>
        ) : (
          <RequestPayoutButton
            amount={Math.max(0, w.balance)}
            orders={w.deliveries}
            bank={w.bank}
            disabledReason={disabledReason}
            endpoint="/rider/withdrawals"
            source="(your wallet balance)"
            reviewer="Your dealer approves it, then the admin transfers it and shares the transaction details here."
            label="Withdraw"
          />
        )}
      </Card>

      <BankAccountCard bank={w.bank} locked={!!w.open} endpoint="/rider/bank-account" />

      {w.withdrawals.length > 0 && (
        <Card className="gap-0 overflow-hidden p-0">
          <p className="border-b px-4 py-3 font-semibold">Withdrawals</p>
          <ul className="divide-y">
            {w.withdrawals.map((x) => {
              const st = payoutStatus(x.status);
              return (
                <li key={x.id} className="space-y-1 px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold tabular-nums">{formatINR(x.amount)}</span>
                    <Pill tone={st.tone}>{x.status === "PENDING" ? "Approved by dealer" : st.label}</Pill>
                  </div>
                  <p className="text-xs text-muted-foreground">Requested {fmtDate(x.createdAt)}</p>
                  {x.status === "PAID" && (
                    <p className="text-xs">
                      {x.payoutMethod} · UTR <span className="font-mono">{x.reference}</span> · {x.paidAt ? fmtDateTime(x.paidAt) : ""}
                      {x.proofUrl && (
                        <a href={x.proofUrl} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-0.5 font-medium text-primary">
                          Receipt <ExternalLink className="size-3" />
                        </a>
                      )}
                    </p>
                  )}
                  {x.status === "REJECTED" && <p className="text-xs text-red-600">{x.rejectionReason}</p>}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card className="gap-0 overflow-hidden p-0">
        <p className="border-b px-4 py-3 font-semibold">Wallet history</p>
        {w.entries.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">No activity yet</p>
        ) : (
          <ul className="divide-y">
            {w.entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{ENTRY_LABEL[e.type] ?? e.type}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {e.note ? `${e.note} · ` : ""}
                    {fmtDateTime(e.createdAt)}
                  </p>
                </div>
                <span className={`shrink-0 font-semibold tabular-nums ${e.amount < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                  {e.amount < 0 ? "−" : "+"} {formatINR(Math.abs(e.amount))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
