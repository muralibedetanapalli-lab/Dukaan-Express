import Link from "next/link";
import {
  AlertOctagon,
  ArrowRight,
  Bike,
  CheckCircle2,
  Circle,
  ClipboardList,
  Clock,
  Handshake,
  IndianRupee,
  LayoutGrid,
  Package,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  Store,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { adminDashboard, salesSeries, type Granularity } from "@/server/services/dashboard";
import { getSessionUser } from "@/server/auth/session";
import { Card } from "@/components/ui/card";
import { OrderStatusBadge, ShipmentStatusBadge } from "@/components/shared/status-badge";
import { formatINR } from "@/lib/money";
import { fmtAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SalesChart } from "./sales-chart";

export const metadata = { title: "Admin dashboard" };

const IST = "Asia/Kolkata";

function greeting(now: Date) {
  const h = Number(
    new Intl.DateTimeFormat("en-IN", {
      hour: "numeric",
      hour12: false,
      timeZone: IST,
    }).format(now),
  );
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ g?: string }> }) {
  const sp = await searchParams;
  const g: Granularity = sp.g === "weekly" || sp.g === "monthly" ? sp.g : "daily";
  const [s, series, user] = await Promise.all([adminDashboard(), salesSeries(g), getSessionUser()]);
  const now = new Date();
  const firstName = (user?.name ?? "Admin").split(" ")[0];
  const placed = Math.max(0, s.orders - s.cancelledOrders);
  const avgOrder = placed ? Math.round(s.totalSales / placed) : 0;

  const attention = [
    {
      n: s.pendingShops,
      label: "shops awaiting approval",
      href: "/admin/shops?approval=PENDING",
      icon: Store,
    },
    {
      n: s.pendingRiderKyc,
      label: "riders to verify",
      href: "/admin/riders",
      icon: ShieldCheck,
    },
    {
      n: s.pendingOrders,
      label: "orders waiting on a shop",
      href: "/admin/orders?status=SHOP_PENDING",
      icon: Clock,
    },
    {
      n: s.waitingForRider,
      label: "deliveries without a rider",
      href: "/admin/shipments?status=CREATED",
      icon: Bike,
    },
    {
      n: s.shipmentExceptions,
      label: "delivery exceptions",
      href: "/admin/shipments?status=EXCEPTION",
      icon: AlertOctagon,
    },
  ].filter((a) => a.n > 0);

  const setup = [
    {
      done: s.categories > 0,
      label: "Set up categories",
      href: "/admin/categories",
    },
    {
      done: s.dealers > 0,
      label: "Add a regional dealer",
      href: "/admin/dealers",
      optional: true,
    },
    {
      done: s.shops > 0,
      label: "Onboard your first shop",
      href: "/admin/shops/new",
    },
    {
      done: s.products > 0,
      label: "Add products to the catalogue",
      href: "/admin/products",
    },
    {
      done: s.riders > 0,
      label: "Bring on a delivery rider",
      href: "/admin/riders",
      optional: true,
    },
    {
      done: s.orders > 0,
      label: "Receive the first order",
      href: "/admin/orders",
    },
  ];
  const setupDone = setup.filter((x) => x.done).length;
  const showSetup = setupDone < setup.length;

  const pipeline = [
    {
      label: "Waiting",
      value: s.pendingOrders,
      icon: Clock,
      bar: "bg-amber-400",
      text: "text-amber-700 dark:text-amber-300",
      href: "/admin/orders?status=SHOP_PENDING",
    },
    {
      label: "In progress",
      value: s.inProgressOrders,
      icon: Truck,
      bar: "bg-sky-500",
      text: "text-sky-700 dark:text-sky-300",
      href: "/admin/orders",
    },
    {
      label: "Delivered",
      value: s.completedOrders,
      icon: PackageCheck,
      bar: "bg-emerald-500",
      text: "text-emerald-700 dark:text-emerald-300",
      href: "/admin/orders?status=DELIVERED",
    },
    {
      label: "Cancelled",
      value: s.cancelledOrders,
      icon: XCircle,
      bar: "bg-rose-400",
      text: "text-rose-700 dark:text-rose-300",
      href: "/admin/orders?status=CANCELLED",
    },
  ];
  const pipelineTotal = pipeline.reduce((a, p) => a + p.value, 0);

  return (
    <div className="space-y-6">
      {/* Hero: greeting, today's numbers and lifetime headline figures */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 p-5 text-white shadow-lg sm:p-7">
        <div aria-hidden className="pointer-events-none absolute -top-16 -right-10 size-56 rounded-full bg-white/10 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-20 left-1/3 size-56 rounded-full bg-amber-300/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm text-emerald-100">
              {new Intl.DateTimeFormat("en-IN", {
                weekday: "long",
                day: "numeric",
                month: "long",
                timeZone: IST,
              }).format(now)}
            </p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
              {greeting(now)}, {firstName}
            </h1>
            <p className="mt-2 text-emerald-50/90">
              Today so far:{" "}
              <span className="font-semibold text-white">
                {s.todayOrders} {s.todayOrders === 1 ? "order" : "orders"}
              </span>{" "}
              worth <span className="font-semibold text-white">{formatINR(s.todaySales)}</span>
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <HeroStat icon={TrendingUp} label="Total sales" value={formatINR(s.totalSales, { compact: true })} />
            <HeroStat icon={Wallet} label="Platform earnings" value={formatINR(s.platformRevenue, { compact: true })} />
            <HeroStat icon={IndianRupee} label="Avg. order" value={formatINR(avgOrder, { compact: true })} />
          </div>
        </div>
      </section>

      {/* What needs the admin now */}
      {attention.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {attention.map((a) => (
            <Link
              key={a.label}
              href={a.href}
              className="group inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3.5 py-1.5 text-sm text-amber-900 transition-colors hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
            >
              <a.icon className="size-4" />
              <span className="font-bold tabular-nums">{a.n}</span> {a.label}
              <ArrowRight className="size-3.5 opacity-60 transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-4" /> All clear: nothing needs your attention right now.
        </p>
      )}

      <div className={cn("grid gap-4", showSetup && "lg:grid-cols-[1fr_22rem]")}>
        <div className="grid gap-4">
          {/* Order pipeline */}
          <Card className="gap-4 p-5">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 font-semibold">
                <ClipboardList className="size-4 text-primary" /> Orders
              </p>
              <Link href="/admin/orders" className="text-sm font-medium text-primary hover:underline">
                {s.orders} total · view all
              </Link>
            </div>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
              {pipelineTotal > 0 && pipeline.map((p) => <div key={p.label} className={p.bar} style={{ width: `${(p.value / pipelineTotal) * 100}%` }} />)}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {pipeline.map((p) => (
                <Link key={p.label} href={p.href} className="rounded-xl border p-3 transition-colors hover:bg-muted/50">
                  <p className={cn("flex items-center gap-1.5 text-xs font-medium", p.text)}>
                    <span className={cn("size-2 rounded-full", p.bar)} /> {p.label}
                  </p>
                  <p className="mt-1 text-2xl font-bold tabular-nums">{p.value}</p>
                </Link>
              ))}
            </div>
          </Card>

          {/* Marketplace network */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <NetworkTile icon={Store} tone="emerald" label="Shops" value={s.shops} sub={`${s.activeShops} live`} href="/admin/shops" />
            <NetworkTile icon={Package} tone="violet" label="Products" value={s.products} sub={`${s.categories} categories`} href="/admin/products" />
            <NetworkTile icon={Users} tone="sky" label="Customers" value={s.customers} href="/admin/customers" />
            <NetworkTile icon={Bike} tone="amber" label="Riders" value={s.riders} sub={`${s.ridersOnline} online now`} href="/admin/riders" />
            <NetworkTile icon={Handshake} tone="rose" label="Dealers" value={s.dealers} href="/admin/dealers" />
          </div>
        </div>

        {showSetup && (
          <Card className="gap-4 p-5">
            <div>
              <p className="flex items-center gap-2 font-semibold">
                <Sparkles className="size-4 text-amber-500" /> Launch checklist
              </p>
              <p className="text-xs text-muted-foreground">
                {setupDone} of {setup.length} done
              </p>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(setupDone / setup.length) * 100}%` }} />
            </div>
            <ol className="space-y-1">
              {setup.map((x) => (
                <li key={x.label}>
                  <Link href={x.href} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/60">
                    {x.done ? <CheckCircle2 className="size-4 shrink-0 text-primary" /> : <Circle className="size-4 shrink-0 text-muted-foreground/50" />}
                    <span className={cn(x.done && "text-muted-foreground line-through")}>{x.label}</span>
                    {x.optional && !x.done && <span className="text-xs text-muted-foreground">optional</span>}
                  </Link>
                </li>
              ))}
            </ol>
          </Card>
        )}
      </div>

      <Card className="p-5">
        <SalesChart data={series} granularity={g} />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
        <Card className="gap-0 p-0">
          <div className="flex items-center justify-between border-b px-5 py-3.5">
            <p className="font-semibold">Recent orders</p>
            <Link href="/admin/orders" className="text-sm font-medium text-primary hover:underline">
              View all
            </Link>
          </div>
          {s.recentOrders.length === 0 ? (
            <EmptyState icon={ClipboardList} text="Orders will appear here as soon as customers start buying." />
          ) : (
            <ul className="divide-y">
              {s.recentOrders.map((o) => (
                <li key={o.id}>
                  <Link href={`/admin/orders/${o.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {o.orderNumber} <span className="font-normal text-muted-foreground">· {o.shop}</span>
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {o.customer ?? "Customer"} · {fmtAgo(o.createdAt)}
                      </p>
                    </div>
                    <OrderStatusBadge status={o.status} />
                    <span className="w-20 text-right text-sm font-semibold tabular-nums">{formatINR(o.total)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="gap-0 p-0">
          <div className="flex items-center justify-between border-b px-5 py-3.5">
            <p className="flex items-center gap-2 font-semibold">
              <Truck className="size-4" /> Deliveries
            </p>
            <Link href="/admin/shipments" className="text-sm font-medium text-primary hover:underline">
              View all
            </Link>
          </div>
          {s.shipments.length === 0 ? (
            <EmptyState icon={LayoutGrid} text="Delivery activity shows up here once orders are packed." />
          ) : (
            <ul className="divide-y">
              {s.shipments
                .sort((a, b) => b.count - a.count)
                .map((x) => (
                  <li key={x.status} className="flex items-center justify-between gap-2 px-5 py-2.5">
                    <ShipmentStatusBadge status={x.status} />
                    <span className="font-bold tabular-nums">{x.count}</span>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function HeroStat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-white/10 px-3 py-2.5 ring-1 ring-white/15 backdrop-blur sm:px-4">
      <p className="flex items-center gap-1.5 text-[11px] text-emerald-100 sm:text-xs">
        <Icon className="size-3.5 shrink-0" /> <span className="truncate">{label}</span>
      </p>
      <p className="mt-0.5 truncate text-lg font-bold tabular-nums sm:text-xl">{value}</p>
    </div>
  );
}

const TONES = {
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

function NetworkTile({
  icon: Icon,
  tone,
  label,
  value,
  sub,
  href,
}: {
  icon: LucideIcon;
  tone: keyof typeof TONES;
  label: string;
  value: number;
  sub?: string;
  href: string;
}) {
  return (
    <Link href={href}>
      <Card className="h-full gap-0 p-4 transition-all hover:-translate-y-0.5 hover:shadow-md">
        <div className={cn("grid size-9 place-items-center rounded-xl", TONES[tone])}>
          <Icon className="size-[18px]" />
        </div>
        <p className="mt-3 text-2xl font-bold tabular-nums">{value.toLocaleString("en-IN")}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground/80">{sub}</p>}
      </Card>
    </Link>
  );
}

function EmptyState({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <div className="grid size-11 place-items-center rounded-full bg-muted">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <p className="max-w-xs text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
