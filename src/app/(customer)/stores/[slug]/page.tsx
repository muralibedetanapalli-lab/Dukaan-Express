import { notFound } from "next/navigation";
import { Clock, MapPin, PackageX, Phone, Star } from "lucide-react";
import { AppError } from "@/server/errors";
import { readLocationCookie } from "@/server/services/location";
import { shopStorefront } from "@/server/services/catalog";
import { ProductGrid } from "@/components/customer/product-card";
import { EmptyState } from "@/components/shared/misc";
import { Pill } from "@/components/shared/status-badge";

export const dynamic = "force-dynamic";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const loc = await readLocationCookie();
  let data;
  try {
    data = await shopStorefront(slug, loc ? { lat: loc.lat, lng: loc.lng } : null);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
  const { shop, reach, products } = data;
  const groups = new Map<string, typeof products>();
  for (const p of products) groups.set(p.categoryName, [...(groups.get(p.categoryName) ?? []), p]);

  return (
    <div>
      <div className="flex flex-col gap-4 rounded-3xl border bg-gradient-to-br from-secondary to-card p-5 sm:flex-row sm:items-center">
        <div className="size-20 shrink-0 overflow-hidden rounded-2xl bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {shop.logoUrl && <img src={shop.logoUrl} alt="" className="size-full object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{shop.name}</h1>
            {reach ? reach.orderable ? <Pill tone="success">Open now</Pill> : <Pill tone="danger">Closed</Pill> : <Pill tone="warning">Doesn&apos;t deliver to you</Pill>}
          </div>
          {shop.description && <p className="mt-1 text-sm text-muted-foreground">{shop.description}</p>}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {reach && (
              <span className="flex items-center gap-1 font-semibold text-primary">
                <Clock className="size-4" /> {reach.etaMinutes} min · {reach.distanceKm.toFixed(1)} km
              </span>
            )}
            {shop.ratingCount > 0 && (
              <span className="flex items-center gap-1 text-amber-600">
                <Star className="size-4 fill-current" /> {shop.rating.toFixed(1)} ({shop.ratingCount})
              </span>
            )}
            <span className="flex items-center gap-1 text-muted-foreground">
              <MapPin className="size-4" /> {shop.address?.line1}, {shop.address?.city}
            </span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <Phone className="size-4" /> {shop.contactPhone}
            </span>
          </div>
          <details className="mt-2 text-xs text-muted-foreground">
            <summary className="cursor-pointer">Opening hours</summary>
            <ul className="mt-1 grid grid-cols-2 gap-x-6 sm:grid-cols-4">
              {shop.hours.map((h) => (
                <li key={h.dayOfWeek}>
                  {DAYS[h.dayOfWeek]}: {h.isClosed ? "Closed" : `${h.openTime}–${h.closeTime}`}
                </li>
              ))}
            </ul>
          </details>
        </div>
      </div>

      {!reach ? (
        <EmptyState className="mt-6" icon={MapPin} title="Outside delivery area" description={`${shop.name} delivers within ${shop.deliveryRadiusKm} km. Change your location to order from this shop.`} />
      ) : products.length === 0 ? (
        <EmptyState className="mt-6" icon={PackageX} title="No products listed yet" />
      ) : (
        [...groups.entries()].map(([cat, items]) => (
          <section key={cat} className="mt-8">
            <h2 className="mb-3 text-lg font-bold">{cat}</h2>
            <ProductGrid items={items} />
          </section>
        ))
      )}
    </div>
  );
}
