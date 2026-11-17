import Link from "next/link";
import { Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/misc";
import { Pill } from "@/components/shared/status-badge";
import { currentHolders, currentPeriod, MIN_DELIVERED, periodLabel, riderLeaderboards, shopLeaderboards, type Board } from "@/server/services/badges";

export const metadata = { title: "Top performers" };
export const dynamic = "force-dynamic";

export default async function TopPerformersPage() {
  const period = currentPeriod();
  const [shops, riders, holders] = await Promise.all([shopLeaderboards(period), riderLeaderboards(period), currentHolders()]);
  const holderShops = holders.all.filter((b) => b.kind === "SHOP");
  const holderRiders = holders.all.filter((b) => b.kind === "RIDER");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Top performers"
        description={`Star badges are awarded monthly: the top shop in each shop category and the top rider in each area. ${periodLabel(holders.period)}'s winners hold the star during ${periodLabel(period)}. At least ${MIN_DELIVERED} deliveries are needed to qualify.`}
      />

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="gap-3 p-4">
          <p className="font-semibold">Star shops now ({periodLabel(holders.period)})</p>
          {holderShops.length === 0 ? (
            <p className="text-sm text-muted-foreground">No winners for {periodLabel(holders.period)}.</p>
          ) : (
            <ul className="space-y-1.5">
              {holderShops.map((b) => (
                <li key={b.id} className="flex items-center gap-2 text-sm">
                  <Star className="size-4 fill-amber-400 text-amber-500" />
                  <Link href={`/admin/shops/${b.shopId}`} className="font-medium hover:underline">
                    {String((b.stats as { name?: string }).name ?? "Shop")}
                  </Link>
                  <span className="text-muted-foreground">· {b.categoryName}</span>
                  <span className="ml-auto tabular-nums">{b.score}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="gap-3 p-4">
          <p className="font-semibold">Star riders now ({periodLabel(holders.period)})</p>
          {holderRiders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No winners for {periodLabel(holders.period)}.</p>
          ) : (
            <ul className="space-y-1.5">
              {holderRiders.map((b) => (
                <li key={b.id} className="flex items-center gap-2 text-sm">
                  <Star className="size-4 fill-amber-400 text-amber-500" />
                  <Link href={`/admin/riders/${b.riderId}`} className="font-medium hover:underline">
                    {String((b.stats as { name?: string }).name ?? "Rider")}
                  </Link>
                  <span className="text-muted-foreground">· {b.categoryName}</span>
                  <span className="ml-auto tabular-nums">{b.score}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Shops — {periodLabel(period)} so far</h2>
        {shops.length === 0 && <Card className="p-6 text-center text-sm text-muted-foreground">No delivered orders yet this month.</Card>}
        {shops.map((b) => (
          <BoardTable
            key={b.categoryKey}
            board={b}
            href={(e) => `/admin/shops/${e.shopId}`}
            cols={["Delivered", "Rejected", "Rating"]}
            row={(e) => [e.delivered, e.rejected, e.rating != null ? `★ ${e.rating}` : "—"]}
          />
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Riders — {periodLabel(period)} so far</h2>
        {riders.length === 0 && <Card className="p-6 text-center text-sm text-muted-foreground">No rider deliveries yet this month.</Card>}
        {riders.map((b) => (
          <BoardTable
            key={b.categoryKey}
            board={b}
            href={(e) => `/admin/riders/${e.riderId}`}
            cols={["Delivered", "On time", "Failed"]}
            row={(e) => [e.delivered, e.onTimePct != null ? `${e.onTimePct}%` : "—", e.failed]}
          />
        ))}
      </section>
    </div>
  );
}

function BoardTable<E extends { name: string; score: number; qualifies: boolean; rank: number }>({
  board,
  href,
  cols,
  row,
}: {
  board: Board<E>;
  href: (e: E) => string;
  cols: string[];
  row: (e: E) => (string | number)[];
}) {
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <p className="border-b px-4 py-2.5 text-sm font-semibold">{board.categoryName}</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            <TableHead>Name</TableHead>
            {cols.map((c) => (
              <TableHead key={c} className="text-right">
                {c}
              </TableHead>
            ))}
            <TableHead className="text-right">Points</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {board.entries.slice(0, 10).map((e) => (
            <TableRow key={href(e)}>
              <TableCell>{e.rank === 1 && e.qualifies ? <Star className="size-4 fill-amber-400 text-amber-500" /> : e.rank}</TableCell>
              <TableCell>
                <Link href={href(e)} className="font-medium hover:underline">
                  {e.name}
                </Link>
                {!e.qualifies && (
                  <Pill className="ml-2" tone="neutral">
                    not qualified yet
                  </Pill>
                )}
              </TableCell>
              {row(e).map((v, i) => (
                <TableCell key={i} className="text-right tabular-nums">
                  {v}
                </TableCell>
              ))}
              <TableCell className="text-right font-semibold tabular-nums">{e.score}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
