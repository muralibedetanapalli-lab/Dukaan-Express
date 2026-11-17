import { db } from "@/server/db";
import { Card } from "@/components/ui/card";
import { formatINR } from "@/lib/money";
import { fmtDateTime } from "@/lib/format";
import type { BankSnapshot } from "@/lib/payout";
import { PayoutReviewActions } from "./payout-review";

/** Rider withdrawals waiting for this dealer's approval. */
export async function PendingRiderWithdrawals({ dealerId, limit }: { dealerId: string; limit?: number }) {
  const items = await db.riderWithdrawal.findMany({
    where: { status: "DEALER_REVIEW", rider: { dealerId } },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: { rider: { select: { id: true, vehicleNumber: true, user: { select: { name: true, phone: true } } } } },
  });
  if (!items.length) return <Card className="p-6 text-center text-sm text-muted-foreground">No rider withdrawals waiting for you.</Card>;
  const delivered = await db.shipment.groupBy({ by: ["riderId"], where: { riderId: { in: items.map((i) => i.riderId) }, status: "DELIVERED" }, _count: true });
  const countOf = new Map(delivered.map((d) => [d.riderId, d._count]));
  return (
    <div className="grid gap-3">
      {items.map((w) => {
        const bank = w.bankSnapshot as BankSnapshot | null;
        return (
          <Card key={w.id} className="gap-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{w.rider.user.name}</p>
                <p className="text-xs text-muted-foreground">
                  {w.rider.user.phone}
                  {w.rider.vehicleNumber ? ` · ${w.rider.vehicleNumber}` : ""} · {countOf.get(w.riderId) ?? 0} deliveries · requested {fmtDateTime(w.createdAt)}
                </p>
              </div>
              <p className="text-2xl font-bold tabular-nums text-primary">{formatINR(w.amount)}</p>
            </div>
            <p className="text-sm">
              <span className="text-muted-foreground">Pay to: </span>
              {bank ? (
                <b>
                  {bank.accountHolderName} · {bank.bankName ? `${bank.bankName} ` : ""}•••• {bank.accountLast4} ({bank.ifsc})
                </b>
              ) : (
                <span className="text-red-600">no bank details</span>
              )}
            </p>
            <PayoutReviewActions
              id={w.id}
              label={`${formatINR(w.amount)} for ${w.rider.user.name}`}
              endpoint={`/dealer/rider-withdrawals/${w.id}/review`}
              approveHelp="It goes to the platform admin, who transfers it to the rider's bank account."
              declineHelp="The money goes back to the rider's wallet and they see your reason."
            />
          </Card>
        );
      })}
    </div>
  );
}
