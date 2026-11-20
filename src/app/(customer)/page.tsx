import Link from "next/link";
import { ArrowRight, BadgePercent, Bike, ChevronRight, Clock, Flame, MapPinOff, ShieldCheck, Sparkles, Star, Store, TrendingUp, Truck, Wallet, Zap } from "lucide-react";
import { getSessionUser } from "@/server/auth/session";
import { readLocationCookie } from "@/server/services/location";
import { homeFeed } from "@/server/services/catalog";
import { currentHolders } from "@/server/services/badges";
import { getSettings } from "@/server/services/settings";
import { db } from "@/server/db";
import { ProductRail } from "@/components/customer/product-card";
import { CUSTOMER_TIMELINE, STATUS_META, TERMINAL_STATUSES, type OrderStatusKey } from "@/lib/order-status";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const IST = "Asia/Kolkata";
function greeting(now: Date) {
  const h = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: IST }).format(now));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** The customer's most recent order that is still on its way (payment-pending orders excluded). */
async function activeOrder(customerId: string) {
  return db.order.findFirst({
    where: { customerId, status: { notIn: [...TERMINAL_STATUSES, "CREATED", "PAYMENT_PENDING", "REFUND_PENDING"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, orderNumber: true, status: true, total: true, shop: { select: { name: true } } },
  });
}

export default async function HomePage() {
  const [user, loc] = await Promise.all([getSessionUser(), readLocationCookie()]);
  if (!loc) {
    return (
      <EmptyHero
        emoji="📍"
        title="Where should we deliver?"
        text="Set your delivery location at the top of the page to see the shops and products near you."
      />
    );
  }
  const customerId = user?.customerId ?? null;
  const [feed, holders, settings, order] = await Promise.all([
    homeFeed({ lat: loc.lat, lng: loc.lng }, customerId),
    currentHolders(),
    getSettings(),
    customerId ? activeOrder(customerId) : null,
  ]);

  if (!feed.shops.length) {
    return (
      <EmptyHero
        emoji="🛵"
        title="We're not in your area yet"
        text={`No partner shops deliver to ${loc.label} right now. Try a nearby location: we're adding new shops every week.`}
        icon={MapPinOff}
      />
    );
  }

  const open = feed.shops.filter((s) => s.orderable);
  const fastest = open.length ? Math.min(...open.map((s) => s.etaMinutes)) : null;
  const firstName = user?.name?.split(" ")[0];
  const freeOver = settings.delivery.freeDeliveryThreshold;

  return (
    <div>
      {/* Greeting + promises */}
      <section className="relative -mx-4 overflow-hidden bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 px-5 pt-5 pb-6 text-white sm:mx-0 sm:rounded-3xl sm:p-7">
        <div aria-hidden className="pointer-events-none absolute -top-16 -right-12 size-56 rounded-full bg-white/10 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 left-1/3 size-56 rounded-full bg-amber-300/25 blur-3xl" />
        <div className="relative">
          <p className="text-sm text-emerald-100">{firstName ? `${greeting(new Date())}, ${firstName} 👋` : `${greeting(new Date())} 👋`}</p>
          <h1 className="mt-1 text-2xl leading-tight font-extrabold sm:text-3xl">
            {fastest ? (
              <>
                Groceries & essentials
                <br className="sm:hidden" /> in <span className="text-amber-300">{fastest} minutes</span>
              </>
            ) : (
              "Your neighbourhood shops, delivered"
            )}
          </h1>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium sm:text-sm">
            <HeroChip icon={Store}>
              {open.length
                ? `${open.length} ${open.length === 1 ? "shop" : "shops"} open near you`
                : `${feed.shops.length} ${feed.shops.length === 1 ? "shop" : "shops"} nearby · opening soon`}
            </HeroChip>
            {freeOver > 0 && <HeroChip icon={Truck}>Free delivery over {formatINR(freeOver)}</HeroChip>}
            <HeroChip icon={Wallet}>UPI, cards or cash</HeroChip>
          </div>
        </div>
      </section>

      {/* Order on its way */}
      {order && <ActiveOrderCard order={order} />}

      {/* Banners */}
      {feed.banners.length > 0 && (
        <div className="scrollbar-none -mx-4 mt-5 flex snap-x gap-3 overflow-x-auto px-4">
          {feed.banners.map((b) => (
            <Link
              key={b.id}
              href={b.linkUrl ?? "/search"}
              className="relative flex h-36 w-[85%] shrink-0 snap-start flex-col justify-end overflow-hidden rounded-2xl p-5 text-white shadow-sm sm:h-44 sm:w-[420px]"
              style={{ background: `linear-gradient(135deg, ${b.bgColor}, ${b.bgColor}cc)` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {b.imageUrl && <img src={b.imageUrl} alt="" className="absolute inset-0 size-full object-cover opacity-30" />}
              <div className="pointer-events-none absolute -top-10 -right-10 size-40 rounded-full bg-white/10" />
              <p className="relative text-xl leading-tight font-extrabold sm:text-2xl">{b.title}</p>
              {b.subtitle && <p className="relative mt-1 text-sm text-white/85">{b.subtitle}</p>}
              <span className="relative mt-3 inline-flex w-fit items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur">
                Shop now <ArrowRight className="size-3.5" />
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* Categories: two scrolling rows on phones, a grid on larger screens */}
      <section className="mt-8">
        <SectionHead title="Shop by category" href="/categories" />
        <div className="scrollbar-none -mx-4 grid auto-cols-[21%] grid-flow-col grid-rows-2 gap-x-3 gap-y-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:auto-cols-auto sm:grid-flow-row sm:grid-cols-6 sm:grid-rows-none sm:overflow-visible sm:px-0 lg:grid-cols-9">
          {feed.categories.map((c) => (
            <Link key={c.id} href={`/search?category=${c.slug}`} className="group flex flex-col items-center gap-1.5 text-center">
              <div className="aspect-square w-full overflow-hidden rounded-2xl bg-secondary shadow-sm ring-1 ring-black/5 transition group-hover:-translate-y-0.5 group-hover:shadow-md">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {c.imageUrl && <img src={c.imageUrl} alt="" className="size-full object-cover" />}
              </div>
              <span className="line-clamp-2 text-[11px] leading-tight font-semibold sm:text-xs">{c.name}</span>
            </Link>
          ))}
        </div>
      </section>

      {feed.recommended.length > 0 && (
        <ProductRail
          title={user ? "Picked for you" : "Top picks near you"}
          subtitle={user ? "Based on what you've ordered before" : "Great prices, quick delivery"}
          icon={<Sparkles className="size-5 text-amber-500" />}
          items={feed.recommended}
        />
      )}

      {/* Shops */}
      <section className="mt-8">
        <SectionHead title="Shops near you" subtitle={`${feed.shops.length} ${feed.shops.length === 1 ? "shop delivers" : "shops deliver"} to ${loc.label}`} />
        <div className="scrollbar-none -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
          {feed.shops.map((s) => {
            const star = holders.shops.get(s.id);
            return (
              <Link
                key={s.id}
                href={`/stores/${s.slug}`}
                className={cn("group relative w-72 shrink-0 snap-start overflow-hidden rounded-2xl border bg-card p-3.5 transition hover:shadow-md", !s.orderable && "opacity-60")}
              >
                <div className="flex items-center gap-3">
                  <div className="size-14 shrink-0 overflow-hidden rounded-xl bg-muted ring-1 ring-black/5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {s.logoUrl && <img src={s.logoUrl} alt="" className="size-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{s.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{s.categoryName}</p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs font-medium">
                  {s.orderable ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-primary">
                      <Clock className="size-3" /> {s.etaMinutes} min
                    </span>
                  ) : (
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">Closed now</span>
                  )}
                  <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{s.distanceKm.toFixed(1)} km</span>
                  {s.ratingCount > 0 && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                      <Star className="size-3 fill-current" /> {s.rating.toFixed(1)}
                    </span>
                  )}
                  {star && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-200 to-amber-100 px-2 py-0.5 font-semibold text-amber-900 dark:from-amber-900 dark:to-amber-950 dark:text-amber-200">
                      <Star className="size-3 fill-amber-500 text-amber-500" /> Top {star.categoryName} shop
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Deals get their own warm band so they stand out */}
      {feed.deals.length > 0 && (
        <div className="-mx-4 mt-8 bg-gradient-to-b from-amber-50 to-transparent px-4 pt-1 pb-2 sm:mx-0 sm:rounded-3xl sm:px-5 dark:from-amber-950/30">
          <ProductRail
            title="Best deals"
            subtitle="Biggest discounts on MRP right now"
            icon={<Flame className="size-5 text-orange-500" />}
            items={feed.deals}
            href="/search?sort=discount"
            className="mt-4"
          />
        </div>
      )}
      <ProductRail title="Popular near you" subtitle="What your neighbours are buying" icon={<TrendingUp className="size-5 text-sky-500" />} items={feed.popular} href="/search" />
      <ProductRail title="Just arrived" subtitle="New in shops near you" icon={<BadgePercent className="size-5 text-violet-500" />} items={feed.recent} href="/search?sort=newest" />

      {/* Why us */}
      <section className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <PromiseCard icon={Zap} title="Super fast" text={fastest ? `Most orders in about ${fastest} min` : "Delivered in minutes"} />
        <PromiseCard icon={Store} title="Local shops" text="From stores you already trust" />
        <PromiseCard icon={Bike} title="Live tracking" text="Follow your order to the door" />
        <PromiseCard icon={ShieldCheck} title="Safe payments" text="UPI, cards or cash on delivery" />
      </section>
    </div>
  );
}

function HeroChip({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 ring-1 ring-white/20 backdrop-blur">
      <Icon className="size-3.5" /> {children}
    </span>
  );
}

function SectionHead({ title, subtitle, href }: { title: string; subtitle?: string; href?: string }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-bold">{title}</h2>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {href && (
        <Link href={href} className="shrink-0 text-sm font-semibold text-primary">
          See all
        </Link>
      )}
    </div>
  );
}

function ActiveOrderCard({ order }: { order: { id: string; orderNumber: string; status: string; total: number; shop: { name: string } } }) {
  const status = order.status as OrderStatusKey;
  const step = Math.max(0, CUSTOMER_TIMELINE.findIndex((t) => t.statuses.includes(status)));
  const pct = Math.round(((step + 1) / CUSTOMER_TIMELINE.length) * 100);
  return (
    <Link
      href={`/orders/${order.id}`}
      className="group relative z-10 -mt-3 mb-1 block rounded-2xl border bg-card p-4 shadow-lg ring-1 ring-black/5 transition hover:shadow-xl sm:mt-4"
    >
      <div className="flex items-center gap-3">
        <span className="relative grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/30" />
          <Bike className="relative size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{STATUS_META[status]?.label ?? "On its way"}</p>
          <p className="truncate text-xs text-muted-foreground">
            {order.shop.name} · {formatINR(order.total)}
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
          Track <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </Link>
  );
}

function PromiseCard({ icon: Icon, title, text }: { icon: React.ElementType; title: string; text: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <span className="grid size-9 place-items-center rounded-xl bg-secondary text-primary">
        <Icon className="size-[18px]" />
      </span>
      <p className="mt-2.5 text-sm font-semibold">{title}</p>
      <p className="text-xs text-muted-foreground">{text}</p>
    </div>
  );
}

function EmptyHero({ emoji, title, text, icon: Icon }: { emoji: string; title: string; text: string; icon?: React.ElementType }) {
  return (
    <section className="mx-auto mt-6 max-w-lg overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 p-8 text-center text-white shadow-lg">
      <div className="mx-auto grid size-20 place-items-center rounded-full bg-white/15 text-4xl ring-1 ring-white/20">{emoji}</div>
      <h1 className="mt-4 flex items-center justify-center gap-2 text-2xl font-extrabold">
        {Icon && <Icon className="size-5 opacity-80" />} {title}
      </h1>
      <p className="mt-2 text-emerald-50/90">{text}</p>
    </section>
  );
}
