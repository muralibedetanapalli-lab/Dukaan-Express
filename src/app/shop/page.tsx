import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  Boxes,
  CheckCircle2,
  ChefHat,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Inbox,
  PackageCheck,
  PackageOpen,
  Sparkles,
  Star,
  TrendingDown,
  TrendingUp,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { getSessionUser } from "@/server/auth/session";
import { activeShopFor } from "@/server/services/inventory";
import { shopDashboard } from "@/server/services/dashboard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OrderStatusBadge } from "@/components/shared/status-badge";
import { LeaderboardCard } from "@/components/shared/leaderboard-card";
import { formatINR } from "@/lib/money";
import { fmtAgo } from "@/lib/format";
import { isOpenNow } from "@/lib/geo";
import { cn } from "@/lib/utils";

export const metadata = { title: "Shop dashboard" };

const IST = "Asia/Kolkata";

function greeting(now: Date) {
  const h = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: IST }).format(now));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function ShopDashboardPage() {
  const user = (await getSessionUser())!;
  const { shop } = await activeShopFor(user);
  const d = await shopDashboard(shop.id);
  const now = new Date();
  const firstName = (user.name ?? "there").split(" ")[0];

  const status =
    shop.approvalStatus !== "APPROVED"
      ? { label: "Awaiting approval", dot: "bg-amber-300" }
      : !shop.isActive
        ? { label: "Not live yet", dot: "bg-amber-300" }
        : !shop.acceptingOrders
          ? { label: "Orders paused", dot: "bg-rose-300" }
          : isOpenNow(shop.hours, now)
            ? { label: "Open · taking orders", dot: "bg-emerald-300 animate-pulse" }
            : { label: "Closed now", dot: "bg-white/60" };

  const pipeline: { label: string; value: number; icon: LucideIcon; href: string; hot?: boolean }[] = [
    { label: "New", value: d.pending, icon: Inbox, href: "/shop/orders?tab=new", hot: d.pending > 0 },
    { label: "Confirmed", value: d.confirmed, icon: ClipboardCheck, href: "/shop/orders?tab=active" },
    { label: "Preparing", value: d.preparing, icon: ChefHat, href: "/shop/orders?tab=active" },
    { label: "To pack", value: d.toPack, icon: PackageOpen, href: "/shop/orders?tab=active" },
    { label: "Dispatch", value: d.packed, icon: Truck, href: "/shop/orders?tab=dispatch" },
    { label: "Delivered", value: d.completed, icon: PackageCheck, href: "/shop/orders?tab=completed" },
  ];

  const weekMax = Math.max(1, ...d.week.map((x) => x.sales));
  const change = d.prevWeekSales ? Math.round(((d.weekSales - d.prevWeekSales) / d.prevWeekSales) * 100) : null;

  const { healthy, low, out } = d.stock;

  const setup = [
    { done: d.totalProducts > 0, label: "Add your products", href: "/shop/inventory/new" },
    { done: shop.hours.length > 0, label: "Set opening hours", href: "/shop/settings" },
    { done: d.hasBankAccount, label: "Add a bank account for payouts", href: "/shop/earnings" },
    { done: d.totalOrders > 0, label: "Get your first order", href: "/shop/orders" },
  ];
  const setupDone = setup.filter((x) => x.done).length;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 p-5 text-white shadow-lg sm:p-7">
        <div aria-hidden className="pointer-events-none absolute -top-16 -right-10 size-56 rounded-full bg-white/10 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-20 left-1/4 size-56 rounded-full bg-amber-300/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 font-medium ring-1 ring-white/20">
                <span className={cn("size-2 rounded-full", status.dot)} /> {status.label}
              </span>
              {shop.ratingCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 ring-1 ring-white/20">
                  <Star className="size-3.5 fill-amber-300 text-amber-300" /> {shop.rating.toFixed(1)}
                  <span className="text-emerald-100">({shop.ratingCount})</span>
                </span>
              )}
            </div>
            <h1 className="mt-3 text-2xl font-bold sm:text-3xl">
              {greeting(now)}, {firstName}
            </h1>
            <p className="mt-1 text-emerald-50/90">Here&apos;s how {shop.name} is doing today.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <HeroStat label="Orders today" value={String(d.todayOrders)} />
            <HeroStat label="Sales today" value={formatINR(d.todayRevenue, { compact: true })} />
            <HeroStat label="You earn" value={formatINR(d.todayEarning, { compact: true })} />
          </div>
        </div>
      </section>

      {/* New orders call to action */}
      {d.pending > 0 && (
        <Link
          href="/shop/orders?tab=new"
          className="group flex items-center gap-4 rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow-sm transition-shadow hover:shadow-md dark:border-amber-800 dark:from-amber-950/50 dark:to-orange-950/40"
        >
          <span className="relative grid size-11 shrink-0 place-items-center rounded-full bg-amber-500 text-white">
            <span className="absolute inset-0 animate-ping rounded-full bg-amber-400/60" />
            <BellRing className="relative size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-amber-950 dark:text-amber-100">
              {d.pending} new {d.pending === 1 ? "order is" : "orders are"} waiting for you
            </p>
            <p className="text-sm text-amber-800/80 dark:text-amber-200/80">Accept quickly: customers see faster shops first.</p>
          </div>
          <span className="hidden items-center gap-1 rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white sm:inline-flex">
            Review <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      )}

      {/* Order pipeline */}
      <Card className="gap-4 p-5">
        <div className="flex items-center justify-between">
          <p className="font-semibold">Order flow</p>
          <Link href="/shop/orders" className="text-sm font-medium text-primary hover:underline">
            All orders
          </Link>
        </div>
        <ol className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {pipeline.map((p, i) => (
            <li key={p.label} className="relative">
              <Link
                href={p.href}
                className={cn(
                  "flex h-full flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center transition-colors hover:bg-muted/50",
                  p.hot && "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40",
                  p.value > 0 && !p.hot && "border-primary/30 bg-secondary/60",
                )}
              >
                <span className={cn("grid size-9 place-items-center rounded-full", p.hot ? "bg-amber-500 text-white" : p.value > 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                  <p.icon className="size-[18px]" />
                </span>
                <span className="text-2xl leading-none font-bold tabular-nums">{p.value}</span>
                <span className="text-xs text-muted-foreground">{p.label}</span>
              </Link>
              {i < pipeline.length - 1 && <ChevronRight aria-hidden className="absolute top-1/2 -right-2 z-10 hidden size-4 -translate-y-1/2 text-muted-foreground/50 sm:block" />}
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {/* This week */}
          <Card className="gap-4 p-5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="font-semibold">Last 7 days</p>
                <p className="text-sm text-muted-foreground">
                  {formatINR(d.weekSales)} from {d.weekOrders} {d.weekOrders === 1 ? "order" : "orders"}
                </p>
              </div>
              {change != null && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
                    change >= 0 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
                  )}
                >
                  {change >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                  {change >= 0 ? "+" : ""}
                  {change}% vs previous week
                </span>
              )}
            </div>
            <div className="flex h-36 items-end gap-2 sm:gap-3">
              {d.week.map((x) => {
                const date = new Date(`${x.day}T12:00:00+05:30`);
                const isToday = x === d.week[d.week.length - 1];
                return (
                  <div key={x.day} className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5" title={`${formatINR(x.sales)} · ${x.orders} orders`}>
                    <span className="text-[10px] font-medium text-muted-foreground tabular-nums opacity-0 transition-opacity group-hover:opacity-100">
                      {x.sales ? formatINR(x.sales, { compact: true }) : ""}
                    </span>
                    <div
                      className={cn("w-full max-w-12 rounded-t-md transition-colors", x.sales ? (isToday ? "bg-primary" : "bg-primary/45 group-hover:bg-primary/70") : "bg-muted")}
                      style={{ height: `${x.sales ? Math.max(6, (x.sales / weekMax) * 100) : 4}%` }}
                    />
                    <span className={cn("text-xs", isToday ? "font-semibold text-foreground" : "text-muted-foreground")}>
                      {isToday ? "Today" : new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: IST }).format(date)}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Active orders */}
          <Card className="gap-0 p-0">
            <div className="flex items-center justify-between border-b px-5 py-3.5">
              <p className="font-semibold">Active orders</p>
              <Button asChild variant="ghost" size="sm">
                <Link href="/shop/orders">View all</Link>
              </Button>
            </div>
            {d.activeOrders.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <div className="grid size-11 place-items-center rounded-full bg-muted">
                  <Inbox className="size-5 text-muted-foreground" />
                </div>
                <p className="font-medium">No active orders</p>
                <p className="max-w-xs text-sm text-muted-foreground">New orders appear here instantly, with a sound alert.</p>
              </div>
            ) : (
              <ul className="divide-y">
                {d.activeOrders.map((o) => (
                  <li key={o.id}>
                    <Link href={`/shop/orders/${o.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{o.orderNumber}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {o.items.reduce((s, i) => s + i.quantity, 0)} items · {fmtAgo(o.createdAt)}
                        </p>
                      </div>
                      <OrderStatusBadge status={o.status} />
                      <span className="w-16 text-right text-sm font-semibold tabular-nums">{formatINR(o.total)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          {setupDone < setup.length && (
            <Card className="gap-3 p-5">
              <div>
                <p className="flex items-center gap-2 font-semibold">
                  <Sparkles className="size-4 text-amber-500" /> Get your shop ready
                </p>
                <p className="text-xs text-muted-foreground">
                  {setupDone} of {setup.length} done
                </p>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(setupDone / setup.length) * 100}%` }} />
              </div>
              <ol className="space-y-0.5">
                {setup.map((x) => (
                  <li key={x.label}>
                    <Link href={x.href} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/60">
                      {x.done ? <CheckCircle2 className="size-4 shrink-0 text-primary" /> : <Circle className="size-4 shrink-0 text-muted-foreground/50" />}
                      <span className={cn(x.done && "text-muted-foreground line-through")}>{x.label}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </Card>
          )}

          {/* Stock health */}
          <Card className="gap-3 p-5">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 font-semibold">
                <Boxes className="size-4 text-primary" /> Stock
              </p>
              <Link href="/shop/inventory" className="text-sm font-medium text-primary hover:underline">
                {d.totalProducts} products
              </Link>
            </div>
            {d.totalProducts > 0 && (
              <>
                <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                  <div className="bg-emerald-500" style={{ width: `${(healthy / d.totalProducts) * 100}%` }} />
                  <div className="bg-amber-400" style={{ width: `${(low / d.totalProducts) * 100}%` }} />
                  <div className="bg-rose-500" style={{ width: `${(out / d.totalProducts) * 100}%` }} />
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <StockCount dot="bg-emerald-500" n={healthy} label="In stock" />
                  <StockCount dot="bg-amber-400" n={low} label="Running low" />
                  <StockCount dot="bg-rose-500" n={out} label="Out of stock" />
                </div>
              </>
            )}
            {d.lowStock.length === 0 ? (
              <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                <CheckCircle2 className="size-4" /> {d.totalProducts ? "Everything is well stocked." : "Add products to start selling."}
              </p>
            ) : (
              <ul className="divide-y rounded-lg border text-sm">
                {d.lowStock.map((i) => (
                  <li key={i.id}>
                    <Link href={`/shop/inventory/${i.id}`} className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-muted/40">
                      <span className="truncate">{i.name}</span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
                          i.stock === 0 ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
                        )}
                      >
                        {i.stock === 0 ? "Out" : `${i.stock} left`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {d.lowStockCount > 0 && (
              <Button asChild size="sm" variant="outline">
                <Link href="/shop/inventory?filter=low">
                  <AlertTriangle /> Restock {d.lowStockCount} {d.lowStockCount === 1 ? "item" : "items"}
                </Link>
              </Button>
            )}
          </Card>

          <LeaderboardCard kind="SHOP" categoryKey={shop.categoryId ?? "none"} meId={shop.id} />
        </div>
      </div>
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-white/10 px-3 py-2.5 ring-1 ring-white/15 backdrop-blur sm:px-4">
      <p className="text-[11px] leading-tight text-emerald-100 sm:text-xs">{label}</p>
      <p className="mt-0.5 truncate text-lg font-bold tabular-nums sm:text-xl">{value}</p>
    </div>
  );
}

function StockCount({ dot, n, label }: { dot: string; n: number; label: string }) {
  return (
    <div className="rounded-lg bg-muted/50 py-1.5">
      <p className="text-base font-bold tabular-nums">{n}</p>
      <p className="flex items-center justify-center gap-1 text-muted-foreground">
        <span className={cn("size-1.5 rounded-full", dot)} /> {label}
      </p>
    </div>
  );
}
