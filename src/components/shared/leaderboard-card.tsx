import { Star, Trophy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { currentHolders, currentPeriod, MIN_DELIVERED, periodLabel, previousPeriod, riderLeaderboards, shopLeaderboards } from "@/server/services/badges";

/**
 * "Top performers" for one category: last month's star holder and this month's live ranking, with the viewer's
 * own position highlighted. Shops see their shop category; riders see their area.
 */
export async function LeaderboardCard({ kind, categoryKey, meId }: { kind: "SHOP" | "RIDER"; categoryKey: string; meId: string }) {
  const period = currentPeriod();
  const [boards, holders] = await Promise.all([kind === "SHOP" ? shopLeaderboards(period) : riderLeaderboards(period), currentHolders()]);
  const board = boards.find((b) => b.categoryKey === categoryKey);
  const holder = holders.all.find((b) => b.kind === kind && b.categoryKey === categoryKey) ?? null;
  const entries = (board?.entries ?? []) as { name: string; score: number; delivered: number; qualifies: boolean; rank: number; shopId?: string; riderId?: string }[];
  const idOf = (e: (typeof entries)[number]) => (kind === "SHOP" ? e.shopId : e.riderId);
  const mine = entries.find((e) => idOf(e) === meId);
  const top = entries.slice(0, 5);
  const iHoldStar = holder && (kind === "SHOP" ? holder.shopId : holder.riderId) === meId;
  const categoryName = board?.categoryName ?? holder?.categoryName ?? (kind === "SHOP" ? "your category" : "your area");

  return (
    <Card className="gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold">
          <Trophy className="size-4 text-amber-500" /> Top performers · {categoryName}
        </p>
        <span className="text-xs text-muted-foreground">{periodLabel(period)}</span>
      </div>

      {iHoldStar ? (
        <div className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-amber-100 to-yellow-50 p-3 text-amber-900 dark:from-amber-950/60 dark:to-amber-900/30 dark:text-amber-100">
          <Star className="size-8 shrink-0 fill-amber-400 text-amber-500" />
          <p className="text-sm">
            <b>You&apos;re the star!</b> Top {kind === "SHOP" ? "shop" : "rider"} in {holder!.categoryName} for {periodLabel(holder!.period)}. Customers see your star badge all this month.
          </p>
        </div>
      ) : holder ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Star className="size-4 fill-amber-400 text-amber-500" /> {periodLabel(previousPeriod())} star:{" "}
          <b className="text-foreground">{String((holder.stats as { name?: string })?.name ?? "—")}</b>
        </p>
      ) : null}

      {top.length === 0 ? (
        <p className="text-sm text-muted-foreground">No deliveries yet this month. The leaderboard fills up as orders are delivered.</p>
      ) : (
        <ol className="space-y-1">
          {top.map((e) => {
            const me = idOf(e) === meId;
            return (
              <li key={idOf(e)} className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm", me && "bg-secondary font-semibold")}>
                <span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold", e.rank === 1 ? "bg-amber-400 text-amber-950" : "bg-muted")}>{e.rank}</span>
                <span className="min-w-0 flex-1 truncate">
                  {e.name}
                  {me && " (you)"}
                </span>
                <span className="text-xs text-muted-foreground">{e.delivered} delivered</span>
                <span className="w-12 text-right tabular-nums">{e.score}</span>
              </li>
            );
          })}
        </ol>
      )}

      {mine && mine.rank > 5 && (
        <p className="text-sm">
          You&apos;re <b>#{mine.rank}</b> with {mine.score} points.
        </p>
      )}
      {!mine && top.length > 0 && <p className="text-sm text-muted-foreground">Deliver orders this month to join the leaderboard.</p>}
      {mine && !mine.qualifies && <p className="text-xs text-muted-foreground">Deliver at least {MIN_DELIVERED} orders this month to qualify for the star.</p>}
      <p className="text-xs text-muted-foreground">
        {kind === "SHOP"
          ? "Points: delivered orders × your customer rating (5★ counts in full, lower ratings count less), minus orders you reject or miss. This month's winner gets the star next month."
          : "Points: deliveries × your customer rating and on-time delivery (5★ and on time count in full), minus failed deliveries. This month's winner gets the star next month."}
      </p>
    </Card>
  );
}
