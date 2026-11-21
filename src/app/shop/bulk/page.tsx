import Link from "next/link";
import { Bike, MapPin, Package, Search, Store, Wallet } from "lucide-react";
import { getSessionUser } from "@/server/auth/session";
import { activeShopFor } from "@/server/services/inventory";
import { wholesalers } from "@/server/services/bulk";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/misc";
import { Pill } from "@/components/shared/status-badge";
import { formatINR } from "@/lib/money";

export const metadata = { title: "Buy in bulk" };
export const dynamic = "force-dynamic";

export default async function BulkMarketPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const user = (await getSessionUser())!;
  const { shop } = await activeShopFor(user);
  const list = await wholesalers(shop.id, q?.trim().slice(0, 60) || undefined);

  return (
    <div className="space-y-4">
      <form className="flex gap-2" action="/shop/bulk">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Search wholesalers or products, e.g. atta, oil" className="pl-9" />
        </div>
        <Button type="submit">Search</Button>
      </form>

      {list.length === 0 ? (
        <EmptyState
          icon={Store}
          title={q ? "No wholesalers match your search" : "No wholesalers yet"}
          description={
            q
              ? "Try another product or shop name."
              : "When shops near you start selling in bulk, they'll show up here. You can sell your own stock in bulk from the 'Sell in bulk' tab."
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((w) => (
            <Link key={w.id} href={`/shop/bulk/sellers/${w.id}`} className="group">
              <Card className="h-full gap-3 p-4 transition group-hover:border-primary/40 group-hover:shadow-md">
                <div className="flex items-start gap-3">
                  {w.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={w.logoUrl} alt="" className="size-12 shrink-0 rounded-xl border object-cover" />
                  ) : (
                    <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                      <Store className="size-6" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold group-hover:text-primary">{w.name}</p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3" />
                      {w.city} {w.pincode}
                      {w.distanceKm != null && ` · ${w.distanceKm < 1 ? "<1" : w.distanceKm.toFixed(1)} km`}
                    </p>
                    {w.category && <p className="text-xs text-muted-foreground">{w.category}</p>}
                  </div>
                  {w.rating && <Pill tone="success">★ {w.rating.toFixed(1)}</Pill>}
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <Pill tone="info">
                    <Package className="size-3" /> {w.products} bulk product{w.products === 1 ? "" : "s"}
                  </Pill>
                  {w.minOrder > 0 && <Pill>Min {formatINR(w.minOrder)}</Pill>}
                  {w.delivers && (
                    <Pill tone="primary">
                      <Bike className="size-3" /> Delivers{w.deliveryFee ? ` · ${formatINR(w.deliveryFee)}` : " free"}
                    </Pill>
                  )}
                  {w.pickup && <Pill>Pickup</Pill>}
                  {w.payOnDelivery && (
                    <Pill>
                      <Wallet className="size-3" /> Pay on delivery
                    </Pill>
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
