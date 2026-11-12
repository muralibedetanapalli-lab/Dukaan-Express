import Link from "next/link";
import { getSessionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/misc";
import { Pill } from "@/components/shared/status-badge";
import { formatINR } from "@/lib/money";
import { fmtDate } from "@/lib/format";
import { payoutStatus } from "@/lib/payout";
import { PendingPayoutReviews } from "../payout-list";

export const metadata = { title: "Payout approvals" };

export default async function DealerPayoutsPage() {
  const user = (await getSessionUser())!;
  const dealerId = user.dealerId!;
  const history = await db.shopSettlement.findMany({
    where: { dealerId, status: { not: "DEALER_REVIEW" } },
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: { shop: { select: { id: true, name: true } } },
  });
  return (
    <div className="space-y-6">
      <PageHeader title="Payout approvals" description="Shops ask to withdraw their earnings. Check the request, then approve it to send it to the platform admin for transfer, or decline it with a reason." />
      <PendingPayoutReviews dealerId={dealerId} />

      <Card className="gap-0 overflow-hidden p-0">
        <p className="border-b px-4 py-3 font-semibold">Reviewed by you</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Shop</TableHead>
              <TableHead>Requested</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Your decision</TableHead>
              <TableHead>Now</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Nothing reviewed yet
                </TableCell>
              </TableRow>
            )}
            {history.map((p) => {
              const declinedByDealer = p.status === "REJECTED" && !!p.dealerReviewedAt && p.dealerNote === p.rejectionReason;
              const st = payoutStatus(p.status);
              return (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link href={`/dealer/shops/${p.shop.id}`} className="font-medium hover:underline">
                      {p.shop.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{fmtDate(p.createdAt)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatINR(p.netPayable)}</TableCell>
                  <TableCell className="text-sm">
                    {!p.dealerReviewedAt ? (
                      <span className="text-muted-foreground">—</span>
                    ) : declinedByDealer ? (
                      <span className="text-red-600 dark:text-red-400">Declined · {p.rejectionReason}</span>
                    ) : (
                      <span>Approved {fmtDate(p.dealerReviewedAt)}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Pill tone={st.tone}>{p.status === "PENDING" ? "With admin" : st.label}</Pill>
                    {p.status === "PAID" && p.reference && <p className="mt-0.5 font-mono text-xs text-muted-foreground">UTR {p.reference}</p>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
