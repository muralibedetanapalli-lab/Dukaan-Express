import { Bike, IndianRupee, MapPin, Navigation, Package, Phone, Store } from "lucide-react";
import { getSessionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { activeDelivery, availableJobs } from "@/server/services/delivery";
import { walletBalance } from "@/server/services/rider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, StatCard } from "@/components/shared/misc";
import { Pill } from "@/components/shared/status-badge";
import { formatINR } from "@/lib/money";
import { AcceptJobButton, ActiveDeliveryActions } from "./rider-actions";
import { LeaderboardCard } from "@/components/shared/leaderboard-card";

export const metadata = { title: "Deliveries" };

const directions = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;

export default async function RiderHome() {
  const user = (await getSessionUser())!;
  const riderId = user.riderId!;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [rider, active, balance, today] = await Promise.all([
    db.rider.findUniqueOrThrow({ where: { id: riderId } }),
    activeDelivery(riderId),
    walletBalance(riderId),
    db.riderWalletEntry.aggregate({ where: { riderId, type: "DELIVERY_EARNING", createdAt: { gte: startOfDay } }, _sum: { amount: true }, _count: true }),
  ]);
  const jobs = rider.isOnline && !active ? await availableJobs(riderId) : [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Today" value={formatINR(today._sum.amount ?? 0)} hint={`${today._count} deliveries`} icon={IndianRupee} tone="success" />
        <StatCard label="Wallet" value={formatINR(balance)} hint={balance < 0 ? "cash to settle" : "available"} icon={IndianRupee} tone={balance < 0 ? "danger" : "primary"} href="/rider/wallet" />
      </div>

      {active ? (
        <ActiveCard d={active} />
      ) : !rider.isOnline ? (
        <EmptyState icon={Bike} title="You're offline" description="Switch Online (top right) to get delivery requests near you." />
      ) : jobs.length === 0 ? (
        <EmptyState icon={Package} title="No deliveries nearby right now" description="Stay online. You'll get an alert as soon as a shop near you packs an order." />
      ) : (
        <section className="space-y-3">
          <h2 className="font-semibold">Deliveries near you</h2>
          {jobs.map((j) => {
            const a = j.order.addressSnapshot as { line1?: string; city?: string };
            return (
              <Card key={j.id} className="gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 font-semibold">
                      <Store className="size-4 text-primary" /> {j.order.shop.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{j.order.shop.address?.line1}</p>
                  </div>
                  <p className="text-xl font-bold tabular-nums text-primary">{formatINR(j.riderFee)}</p>
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {j.pickupKm != null && <Pill>{j.pickupKm.toFixed(1)} km to shop</Pill>}
                  <Pill>{j.order.distanceKm.toFixed(1)} km to customer</Pill>
                  <Pill>
                    {j.order._count.items} item{j.order._count.items === 1 ? "" : "s"}
                  </Pill>
                  {j.codAmount > 0 ? <Pill tone="warning">Collect {formatINR(j.codAmount)} cash</Pill> : <Pill tone="success">Prepaid</Pill>}
                </div>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="size-3.5" /> Drop: {a.city ?? ""}
                </p>
                <AcceptJobButton id={j.id} fee={j.riderFee} />
              </Card>
            );
          })}
        </section>
      )}

      <LeaderboardCard kind="RIDER" categoryKey={rider.serviceAreaId ?? "none"} meId={riderId} />
    </div>
  );
}

function ActiveCard({ d }: { d: NonNullable<Awaited<ReturnType<typeof activeDelivery>>> }) {
  const toShop = d.status === "COURIER_ASSIGNED";
  const o = d.order;
  const drop = o.addressSnapshot as { name?: string; line1?: string; line2?: string | null; landmark?: string | null; city?: string; pincode?: string };
  const shopAddr = o.shop.address;
  return (
    <Card className="gap-4 p-4">
      <div className="flex items-center justify-between">
        <p className="font-semibold">Current delivery · {o.orderNumber}</p>
        <Pill tone="primary">{toShop ? "Go to shop" : "Deliver"}</Pill>
      </div>

      <ol className="space-y-3">
        <li className={toShop ? "" : "opacity-50"}>
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Store className="size-4 text-primary" /> 1. Pick up at {o.shop.name}
          </p>
          <p className="text-xs text-muted-foreground">{shopAddr ? `${shopAddr.line1}${shopAddr.landmark ? `, ${shopAddr.landmark}` : ""}, ${shopAddr.city}` : ""}</p>
          {toShop && (
            <div className="mt-2 flex gap-2">
              {shopAddr && (
                <Button asChild size="sm" variant="outline">
                  <a href={directions(shopAddr.latitude, shopAddr.longitude)} target="_blank" rel="noreferrer">
                    <Navigation /> Navigate
                  </a>
                </Button>
              )}
              <Button asChild size="sm" variant="outline">
                <a href={`tel:${o.shop.contactPhone}`}>
                  <Phone /> Call shop
                </a>
              </Button>
            </div>
          )}
        </li>
        <li className={toShop ? "opacity-50" : ""}>
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <MapPin className="size-4 text-primary" /> 2. Deliver to {o.contactName}
          </p>
          <p className="text-xs text-muted-foreground">
            {[drop.line1, drop.line2, drop.landmark, drop.city, drop.pincode].filter(Boolean).join(", ")}
          </p>
          {!toShop && (
            <div className="mt-2 flex gap-2">
              <Button asChild size="sm" variant="outline">
                <a href={directions(o.deliveryLat, o.deliveryLng)} target="_blank" rel="noreferrer">
                  <Navigation /> Navigate
                </a>
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href={`tel:${o.contactPhone}`}>
                  <Phone /> Call customer
                </a>
              </Button>
            </div>
          )}
        </li>
      </ol>

      <div className="rounded-xl bg-muted/60 p-3 text-sm">
        <p className="mb-1 font-medium">
          {o.items.length} item{o.items.length === 1 ? "" : "s"}
        </p>
        <ul className="text-xs text-muted-foreground">
          {o.items.map((i, k) => (
            <li key={k}>
              {i.quantity} × {i.productName}
              {i.variantName ? ` (${i.variantName})` : ""}
            </li>
          ))}
        </ul>
        <p className="mt-2 flex justify-between font-semibold">
          <span>{d.codAmount ? "Collect in cash" : "Prepaid — collect nothing"}</span>
          {d.codAmount > 0 && <span>{formatINR(d.codAmount)}</span>}
        </p>
        <p className="flex justify-between text-xs text-muted-foreground">
          <span>You earn</span>
          <span>{formatINR(d.riderFee)}</span>
        </p>
      </div>

      <ActiveDeliveryActions id={d.id} stage={toShop ? "to_shop" : "to_customer"} cod={d.codAmount} />
    </Card>
  );
}
