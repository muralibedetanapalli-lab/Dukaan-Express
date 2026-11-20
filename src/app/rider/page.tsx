import Link from "next/link";
import { AlertTriangle, ArrowRight, Banknote, CheckCircle2, MapPin, Navigation, Package, Phone, Radar, Star, Store, Wallet } from "lucide-react";
import { subDays } from "date-fns";
import { RouteMap } from "./route-map";
import { getSessionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { activeDelivery, availableJobs } from "@/server/services/delivery";
import { walletBalance } from "@/server/services/rider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";
import { AcceptJobButton, ActiveDeliveryActions } from "./rider-actions";
import { OnlineButton } from "./online-button";
import { LeaderboardCard } from "@/components/shared/leaderboard-card";

export const metadata = { title: "Deliveries" };

const IST = "Asia/Kolkata";
const istDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: IST }).format(d);
function greeting(now: Date) {
  const h = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: IST }).format(now));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function RiderHome() {
  const user = (await getSessionUser())!;
  const riderId = user.riderId!;
  const now = new Date();
  const todayStart = new Date(`${istDay(now)}T00:00:00+05:30`);
  const weekStart = new Date(`${istDay(subDays(now, 6))}T00:00:00+05:30`);
  const [rider, active, balance, week] = await Promise.all([
    db.rider.findUniqueOrThrow({ where: { id: riderId } }),
    activeDelivery(riderId),
    walletBalance(riderId),
    db.riderWalletEntry.findMany({ where: { riderId, type: "DELIVERY_EARNING", createdAt: { gte: weekStart } }, select: { amount: true, createdAt: true } }),
  ]);
  const jobs = rider.isOnline && !active ? await availableJobs(riderId) : [];

  const today = week.filter((e) => e.createdAt >= todayStart);
  const todayEarned = today.reduce((a, e) => a + e.amount, 0);
  const days = Array.from({ length: 7 }, (_, i) => istDay(subDays(now, 6 - i)));
  const perDay = days.map((d) => ({ day: d, amount: week.filter((e) => istDay(e.createdAt) === d).reduce((a, e) => a + e.amount, 0) }));
  const weekTotal = perDay.reduce((a, d) => a + d.amount, 0);
  const weekMax = Math.max(1, ...perDay.map((d) => d.amount));
  const firstName = (user.name ?? "Rider").split(" ")[0];
  const online = rider.isOnline;

  return (
    <div className="space-y-4">
      {/* Status hero */}
      <section
        className={cn(
          "relative overflow-hidden rounded-3xl p-5 text-white shadow-lg",
          online ? "bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800" : "bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900",
        )}
      >
        <div aria-hidden className="pointer-events-none absolute -top-16 -right-12 size-56 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-white/75">
              {greeting(now)}, {firstName}
            </p>
            <h1 className="mt-0.5 flex items-center gap-2 text-2xl font-extrabold">
              <span className={cn("size-2.5 rounded-full", online ? "animate-pulse bg-emerald-300" : "bg-slate-400")} />
              {active ? "On a delivery" : online ? "You're online" : "You're offline"}
            </h1>
            <p className="mt-1 text-sm text-white/80">
              {active ? "Finish this one to get the next job." : online ? "We'll alert you when a shop nearby packs an order." : "Go online to start getting delivery requests."}
            </p>
          </div>
          {rider.ratingCount > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-sm font-semibold ring-1 ring-white/20">
              <Star className="size-3.5 fill-amber-300 text-amber-300" /> {rider.rating.toFixed(1)}
            </span>
          )}
        </div>
        <div className="relative mt-4 grid grid-cols-3 gap-2">
          <HeroStat label="Earned today" value={formatINR(todayEarned)} />
          <HeroStat label="Deliveries" value={String(today.length)} />
          <Link href="/rider/wallet" className="block">
            <HeroStat label="Wallet" value={formatINR(balance)} warn={balance < 0} />
          </Link>
        </div>
        {!active && <OnlineButton className="relative mt-4 w-full" />}
      </section>

      {balance < 0 && (
        <Link
          href="/rider/wallet"
          className="flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-3.5 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
        >
          <Banknote className="size-5 shrink-0 text-amber-600" />
          <span className="min-w-0 flex-1">
            You&apos;re holding <b>{formatINR(-balance)}</b> of customers&apos; cash. Settle it from your wallet.
          </span>
          <ArrowRight className="size-4 shrink-0" />
        </Link>
      )}

      {active ? (
        <ActiveCard d={active} />
      ) : !online ? null : jobs.length === 0 ? (
        <Card className="items-center gap-3 px-6 py-10 text-center">
          <span className="relative grid size-20 place-items-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-primary/15" />
            <span className="absolute inset-3 animate-ping rounded-full bg-primary/20 [animation-delay:400ms]" />
            <span className="relative grid size-12 place-items-center rounded-full bg-primary text-primary-foreground">
              <Radar className="size-6" />
            </span>
          </span>
          <p className="font-semibold">Looking for deliveries near you…</p>
          <p className="max-w-xs text-sm text-muted-foreground">Keep the app open. You&apos;ll hear an alert the moment a nearby shop packs an order.</p>
        </Card>
      ) : (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 font-semibold">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
            </span>
            {jobs.length} {jobs.length === 1 ? "delivery" : "deliveries"} near you
          </h2>
          {jobs.map((j) => {
            const a = j.order.addressSnapshot as { line1?: string; city?: string };
            return (
              <Card key={j.id} className="gap-3 overflow-hidden p-0">
                <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-emerald-50 to-transparent px-4 pt-3.5 pb-2 dark:from-emerald-950/40">
                  <span className="text-xs font-medium text-muted-foreground">
                    {j.order._count.items} item{j.order._count.items === 1 ? "" : "s"} · {(j.order.distanceKm + (j.pickupKm ?? 0)).toFixed(1)} km total
                  </span>
                  <span className="rounded-full bg-primary px-3 py-1 text-base font-extrabold text-primary-foreground tabular-nums">{formatINR(j.riderFee)}</span>
                </div>
                <ol className="relative mx-4 space-y-3 border-l-2 border-dashed border-muted-foreground/30 pl-5">
                  <li className="relative">
                    <span className="absolute top-0.5 -left-[27px] grid size-4 place-items-center rounded-full bg-primary ring-4 ring-card">
                      <Store className="size-2.5 text-primary-foreground" />
                    </span>
                    <p className="text-sm font-semibold">{j.order.shop.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {j.order.shop.address?.line1}
                      {j.pickupKm != null ? ` · ${j.pickupKm.toFixed(1)} km from you` : ""}
                    </p>
                  </li>
                  <li className="relative">
                    <span className="absolute top-0.5 -left-[27px] grid size-4 place-items-center rounded-full bg-rose-500 ring-4 ring-card">
                      <MapPin className="size-2.5 text-white" />
                    </span>
                    <p className="text-sm font-semibold">Customer{a.city ? ` · ${a.city}` : ""}</p>
                    <p className="text-xs text-muted-foreground">{j.order.distanceKm.toFixed(1)} km from the shop</p>
                  </li>
                </ol>
                <div className="flex items-center gap-2 px-4">
                  {j.codAmount > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                      <Banknote className="size-3.5" /> Collect {formatINR(j.codAmount)} cash
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      <CheckCircle2 className="size-3.5" /> Prepaid
                    </span>
                  )}
                </div>
                <div className="px-4 pb-4">
                  <AcceptJobButton id={j.id} fee={j.riderFee} />
                </div>
              </Card>
            );
          })}
        </section>
      )}

      {/* This week */}
      <Card className="gap-3 p-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="font-semibold">This week</p>
            <p className="text-sm text-muted-foreground">{formatINR(weekTotal)} earned</p>
          </div>
          <Link href="/rider/wallet" className="inline-flex items-center gap-1 text-sm font-medium text-primary">
            <Wallet className="size-4" /> Wallet
          </Link>
        </div>
        <div className="flex h-28 items-end gap-2">
          {perDay.map((d, i) => {
            const isToday = i === perDay.length - 1;
            return (
              <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={formatINR(d.amount)}>
                <div
                  className={cn("w-full max-w-10 rounded-t-md", d.amount ? (isToday ? "bg-primary" : "bg-primary/45") : "bg-muted")}
                  style={{ height: `${d.amount ? Math.max(8, (d.amount / weekMax) * 100) : 4}%` }}
                />
                <span className={cn("text-[11px]", isToday ? "font-semibold" : "text-muted-foreground")}>
                  {isToday ? "Today" : new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: IST }).format(new Date(`${d.day}T12:00:00+05:30`))}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      <LeaderboardCard kind="RIDER" categoryKey={rider.serviceAreaId ?? "none"} meId={riderId} />
    </div>
  );
}

function HeroStat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={cn("min-w-0 rounded-xl px-3 py-2 ring-1", warn ? "bg-amber-400/25 ring-amber-300/50" : "bg-white/10 ring-white/15")}>
      <p className="text-[11px] leading-tight text-white/75">{label}</p>
      <p className="mt-0.5 truncate text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}

function ActiveCard({ d }: { d: NonNullable<Awaited<ReturnType<typeof activeDelivery>>> }) {
  const toShop = d.status === "COURIER_ASSIGNED";
  const o = d.order;
  const drop = o.addressSnapshot as { name?: string; line1?: string; line2?: string | null; landmark?: string | null; city?: string; pincode?: string };
  const shopAddr = o.shop.address;
  return (
    <Card className="gap-4 overflow-hidden p-0">
      {/* Step header */}
      <div className="bg-primary px-4 py-3 text-primary-foreground">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 font-bold">
            <Navigation className="size-4" /> {toShop ? "Go to the shop" : "Deliver to the customer"}
          </p>
          <span className="text-xs opacity-80">{o.orderNumber}</span>
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          <span className="h-1.5 rounded-full bg-white" />
          <span className={cn("h-1.5 rounded-full", toShop ? "bg-white/30" : "bg-white")} />
        </div>
        <div className="mt-1 grid grid-cols-2 text-[11px] opacity-90">
          <span>1. Pick up</span>
          <span>2. Deliver</span>
        </div>
      </div>

      <div className="space-y-4 px-4">
        <Stop
          active={toShop}
          done={!toShop}
          icon={Store}
          title={`Pick up at ${o.shop.name}`}
          address={shopAddr ? `${shopAddr.line1}${shopAddr.landmark ? `, ${shopAddr.landmark}` : ""}, ${shopAddr.city}` : ""}
        >
          {toShop && (
            <>
              {shopAddr && <RouteMap kind="shop" label="shop" to={{ lat: shopAddr.latitude, lng: shopAddr.longitude }} />}
              <Button asChild size="sm" variant="outline">
                <a href={`tel:${o.shop.contactPhone}`}>
                  <Phone /> Call shop
                </a>
              </Button>
            </>
          )}
        </Stop>
        <Stop
          active={!toShop}
          icon={MapPin}
          title={`Deliver to ${o.contactName}`}
          address={[drop.line1, drop.line2, drop.landmark, drop.city, drop.pincode].filter(Boolean).join(", ")}
        >
          {!toShop && (
            <>
              <RouteMap kind="customer" label="customer" to={{ lat: o.deliveryLat, lng: o.deliveryLng }} />
              <Button asChild size="sm" variant="outline">
                <a href={`tel:${o.contactPhone}`}>
                  <Phone /> Call customer
                </a>
              </Button>
            </>
          )}
        </Stop>

        {/* Money */}
        {d.codAmount > 0 ? (
          <div className="flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-3.5 dark:border-amber-800 dark:bg-amber-950/40">
            <AlertTriangle className="size-5 shrink-0 text-amber-600" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">Collect cash from the customer</p>
              <p className="text-xs text-amber-800/80 dark:text-amber-200/80">Count it before handing over the order.</p>
            </div>
            <p className="text-xl font-extrabold text-amber-950 tabular-nums dark:text-amber-100">{formatINR(d.codAmount)}</p>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 p-3 text-sm font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
            <CheckCircle2 className="size-4" /> Prepaid: collect nothing
          </div>
        )}

        <details className="group rounded-2xl bg-muted/60 p-3 text-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between font-medium">
            <span className="flex items-center gap-2">
              <Package className="size-4" /> {o.items.length} item{o.items.length === 1 ? "" : "s"} in this order
            </span>
            <span className="text-xs text-muted-foreground group-open:hidden">Show</span>
          </summary>
          <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
            {o.items.map((i, k) => (
              <li key={k}>
                {i.quantity} × {i.productName}
                {i.variantName ? ` (${i.variantName})` : ""}
              </li>
            ))}
          </ul>
        </details>

        <p className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">You earn for this delivery</span>
          <span className="text-lg font-bold text-primary tabular-nums">{formatINR(d.riderFee)}</span>
        </p>
      </div>

      <div className="px-4 pb-4">
        <ActiveDeliveryActions id={d.id} stage={toShop ? "to_shop" : "to_customer"} cod={d.codAmount} />
      </div>
    </Card>
  );
}

function Stop({
  active,
  done,
  icon: Icon,
  title,
  address,
  children,
}: {
  active: boolean;
  done?: boolean;
  icon: React.ElementType;
  title: string;
  address: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("flex gap-3", !active && "opacity-55")}>
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", done ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
        {done ? <CheckCircle2 className="size-4" /> : <Icon className="size-4" />}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">{address}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
