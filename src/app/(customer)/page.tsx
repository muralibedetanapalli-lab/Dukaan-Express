import Link from "next/link";
import { Clock, MapPinOff, Star } from "lucide-react";
import { getSessionUser } from "@/server/auth/session";
import { readLocationCookie } from "@/server/services/location";
import { homeFeed } from "@/server/services/catalog";
import { ProductRail } from "@/components/customer/product-card";
import { EmptyState } from "@/components/shared/misc";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [user, loc] = await Promise.all([getSessionUser(), readLocationCookie()]);
  if (!loc) {
    return (
      <div className="py-10">
        <EmptyState icon={MapPinOff} title="Set your delivery location" description="Choose your location to see shops and products that deliver to you." />
      </div>
    );
  }
  const feed = await homeFeed({ lat: loc.lat, lng: loc.lng }, user?.customerId ?? null);

  if (!feed.shops.length) {
    return (
      <div className="py-10">
        <EmptyState
          icon={MapPinOff}
          title="We're not in your area yet"
          description={`No partner shops currently deliver to ${loc.label}. Try another location — we're expanding fast!`}
        />
      </div>
    );
  }

  return (
    <div>
      {/* Banners */}
      {feed.banners.length > 0 && (
        <div className="scrollbar-none -mx-4 flex snap-x gap-3 overflow-x-auto px-4">
          {feed.banners.map((b) => (
            <Link
              key={b.id}
              href={b.linkUrl ?? "/search"}
              className="relative flex h-36 w-[85%] shrink-0 snap-start flex-col justify-end overflow-hidden rounded-2xl p-5 text-white sm:h-44 sm:w-[420px]"
              style={{ background: `linear-gradient(135deg, ${b.bgColor}, ${b.bgColor}cc)` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {b.imageUrl && <img src={b.imageUrl} alt="" className="absolute inset-0 size-full object-cover opacity-30" />}
              <div className="pointer-events-none absolute -top-10 -right-10 size-40 rounded-full bg-white/10" />
              <p className="relative text-xl leading-tight font-extrabold sm:text-2xl">{b.title}</p>
              {b.subtitle && <p className="relative mt-1 text-sm text-white/85">{b.subtitle}</p>}
            </Link>
          ))}
        </div>
      )}

      {/* Categories */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">Shop by category</h2>
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-9">
          {feed.categories.map((c) => (
            <Link key={c.id} href={`/search?category=${c.slug}`} className="group flex flex-col items-center gap-1.5 text-center">
              <div className="aspect-square w-full overflow-hidden rounded-2xl bg-secondary transition group-hover:scale-105">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {c.imageUrl && <img src={c.imageUrl} alt="" className="size-full object-cover" />}
              </div>
              <span className="line-clamp-2 text-xs leading-tight font-semibold">{c.name}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Nearby shops */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">Shops near you</h2>
        <div className="scrollbar-none -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
          {feed.shops.map((s) => (
            <Link
              key={s.id}
              href={`/stores/${s.slug}`}
              className={cn("flex w-64 shrink-0 snap-start items-center gap-3 rounded-2xl border bg-card p-3 transition hover:shadow-md", !s.orderable && "opacity-60")}
            >
              <div className="size-14 shrink-0 overflow-hidden rounded-xl bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {s.logoUrl && <img src={s.logoUrl} alt="" className="size-full object-cover" />}
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold">{s.name}</p>
                <p className="truncate text-xs text-muted-foreground">{s.categoryName}</p>
                <p className="mt-1 flex items-center gap-2 text-xs font-medium">
                  {s.orderable ? (
                    <span className="flex items-center gap-1 text-primary">
                      <Clock className="size-3" /> {s.etaMinutes} min
                    </span>
                  ) : (
                    <span className="text-destructive">Closed now</span>
                  )}
                  <span className="text-muted-foreground">{s.distanceKm.toFixed(1)} km</span>
                  {s.ratingCount > 0 && (
                    <span className="flex items-center gap-0.5 text-amber-600">
                      <Star className="size-3 fill-current" /> {s.rating.toFixed(1)}
                    </span>
                  )}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {feed.recommended.length > 0 && <ProductRail title={user ? "Recommended for you" : "Top picks near you"} items={feed.recommended} />}
      <ProductRail title="Best deals" items={feed.deals} href="/search?sort=discount" />
      <ProductRail title="Popular near you" items={feed.popular} href="/search" />
      <ProductRail title="Recently added" items={feed.recent} href="/search?sort=newest" />
    </div>
  );
}
