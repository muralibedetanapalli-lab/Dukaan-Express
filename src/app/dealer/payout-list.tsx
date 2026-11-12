import Link from "next/link";
import { db } from "@/server/db";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/shared/status-badge";
import { formatINR } from "@/lib/money";
import { fmtDate, fmtDateTime } from "@/lib/format";
import type { BankSnapshot } from "@/lib/payout";
import { PayoutReviewActions } from "./payout-review";

/** Shop payout requests waiting for this dealer, with what they need to check before approving. */
export async function PendingPayoutReviews({ dealerId, limit }: { dealerId: string; limit?: number }) {
  const items = await db.shopSettlement.findMany({
    where: { status: "DEALER_REVIEW", shop: { dealerId } },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: {
      shop: { select: { id: true, name: true, address: { select: { city: true } } } },
      commissions: { select: { order: { select: { orderNumber: true } } }, orderBy: { createdAt: "desc" }, take: 8 },
    },
  });
  if (!items.length) {
    return <Card className="p-6 text-center text-sm text-muted-foreground">No payout requests waiting for you.</Card>;
  }
  return (
    <div className="grid gap-3">
      {items.map((p) => {
        const bank = p.bankSnapshot as BankSnapshot | null;
        return (
          <Card key={p.id} className="gap-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/dealer/shops/${p.shop.id}`} className="font-semibold hover:underline">
                  {p.shop.name}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {p.shop.address?.city} · requested {fmtDateTime(p.createdAt)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold tabular-nums text-primary">{formatINR(p.netPayable)}</p>
                <p className="text-xs text-muted-foreground">to the shop</p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl bg-muted/60 p-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">Orders</dt>
                <dd className="font-medium">{p.orderCount}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Item sales</dt>
                <dd className="font-medium tabular-nums">{formatINR(p.grossSales)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Platform commission</dt>
                <dd className="font-medium tabular-nums">{formatINR(p.commissionAmount)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Delivered between</dt>
                <dd className="font-medium">
                  {fmtDate(p.periodStart)} – {fmtDate(p.periodEnd)}
                </dd>
              </div>
            </dl>
            <div className="grid gap-1 text-sm">
              <p>
                <span className="text-muted-foreground">Pay to: </span>
                {bank ? (
                  <b>
                    {bank.accountHolderName} · {bank.bankName ? `${bank.bankName} ` : ""}•••• {bank.accountLast4} ({bank.ifsc})
                  </b>
                ) : (
                  <span className="text-red-600">no bank details</span>
                )}
              </p>
              <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                Orders:
                {p.commissions.map((c) => (
                  <Pill key={c.order.orderNumber}>{c.order.orderNumber}</Pill>
                ))}
                {p.orderCount > p.commissions.length && <span>+{p.orderCount - p.commissions.length} more</span>}
              </p>
            </div>
            <PayoutReviewActions id={p.id} label={`${formatINR(p.netPayable)} for ${p.shop.name}`} />
          </Card>
        );
      })}
    </div>
  );
}
