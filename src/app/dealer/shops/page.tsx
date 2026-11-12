import Link from "next/link";
import { ChevronRight, Plus, Store } from "lucide-react";
import { getSessionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, ProductThumb } from "@/components/shared/misc";
import { Pill } from "@/components/shared/status-badge";
import { formatINR } from "@/lib/money";

export const metadata = { title: "My shops" };

export default async function DealerShopsPage() {
  const user = (await getSessionUser())!;
  const dealerId = user.dealerId!;
  const shops = await db.shop.findMany({
    where: { dealerId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { address: { select: { city: true, pincode: true } }, owner: { include: { user: { select: { name: true, phone: true } } } }, _count: { select: { inventory: true } } },
  });
  const ids = shops.map((s) => s.id);
  const [sales, waiting] = await Promise.all([
    db.commission.groupBy({ by: ["shopId"], where: { shopId: { in: ids } }, _sum: { baseAmount: true }, _count: true }),
    db.shopSettlement.groupBy({ by: ["shopId"], where: { shopId: { in: ids }, status: "DEALER_REVIEW" }, _count: true }),
  ]);
  const salesOf = new Map(sales.map((s) => [s.shopId, s]));
  const waitingOf = new Map(waiting.map((w) => [w.shopId, w._count]));

  return (
    <div>
      <PageHeader
        title="My shops"
        description={`${shops.length} ${shops.length === 1 ? "shop" : "shops"} you onboarded or manage`}
        actions={
          <Button asChild>
            <Link href="/dealer/shops/new">
              <Plus /> Onboard a shop
            </Link>
          </Button>
        }
      />
      {shops.length === 0 ? (
        <EmptyState icon={Store} title="No shops yet" description="Onboard a shop in your region. It goes live as soon as you save it." />
      ) : (
        <Card className="gap-0 divide-y overflow-hidden p-0">
          {shops.map((s) => {
            const sale = salesOf.get(s.id);
            return (
              <Link key={s.id} href={`/dealer/shops/${s.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                <ProductThumb src={s.logoUrl} alt={s.name} className="size-11 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {s.name}
                    {!s.isActive || s.approvalStatus !== "APPROVED" ? <Pill tone="neutral">Inactive</Pill> : !s.acceptingOrders ? <Pill tone="warning">Paused</Pill> : <Pill tone="success">Live</Pill>}
                    {waitingOf.get(s.id) ? <Pill tone="warning">Payout to approve</Pill> : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {s.address?.city} {s.address?.pincode} · {s.owner?.user.name ?? "No owner"} · {s._count.inventory} products
                  </p>
                </div>
                <div className="hidden text-right sm:block">
                  <p className="text-sm font-semibold tabular-nums">{formatINR(sale?._sum.baseAmount ?? 0)}</p>
                  <p className="text-xs text-muted-foreground">{sale?._count ?? 0} delivered</p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            );
          })}
        </Card>
      )}
    </div>
  );
}
