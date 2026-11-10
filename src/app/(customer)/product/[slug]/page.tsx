import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, MapPin, ShieldCheck, Store } from "lucide-react";
import { AppError } from "@/server/errors";
import { readLocationCookie } from "@/server/services/location";
import { productDetail } from "@/server/services/catalog";
import { AddButton } from "@/components/customer/add-button";
import { ProductRail } from "@/components/customer/product-card";
import { Pill } from "@/components/shared/status-badge";
import { formatINR } from "@/lib/money";
import { unitLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const loc = await readLocationCookie();
  let data;
  try {
    data = await productDetail(slug, loc ? { lat: loc.lat, lng: loc.lng } : null);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
  const { product, offers, similar } = data;
  const best = offers.find((o) => o.orderable) ?? offers[0];

  return (
    <div>
      <nav className="mb-4 text-xs text-muted-foreground">
        <Link href="/">Home</Link> / <Link href={`/search?category=${product.category.slug}`}>{product.category.name}</Link>
        {product.subcategory && (
          <>
            {" "}
            / <Link href={`/search?category=${product.category.slug}&sub=${product.subcategory.slug}`}>{product.subcategory.name}</Link>
          </>
        )}
      </nav>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div className="space-y-3">
          <div className="aspect-square overflow-hidden rounded-3xl border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {product.images[0] && <img src={product.images[0].url} alt={product.name} className="size-full object-cover" />}
          </div>
          {product.images.length > 1 && (
            <div className="flex gap-2">
              {product.images.map((i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i.id} src={i.url} alt="" className="size-16 rounded-xl border object-cover" />
              ))}
            </div>
          )}
        </div>
        <div>
          {product.brand && <p className="text-sm font-semibold text-primary">{product.brand}</p>}
          <h1 className="text-2xl font-bold">{product.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{best?.variantName ?? unitLabel(product.unit, product.unitValue)}</p>

          {!loc ? (
            <p className="mt-6 rounded-xl border bg-muted/50 p-4 text-sm">Set your delivery location to see prices from shops near you.</p>
          ) : !offers.length ? (
            <p className="mt-6 rounded-xl border bg-muted/50 p-4 text-sm">This product isn&apos;t available from shops delivering to {loc.label}.</p>
          ) : (
            <>
              {best && (
                <div className="mt-5 flex items-end gap-3">
                  <span className="text-3xl font-extrabold">{formatINR(best.price)}</span>
                  {best.mrp > best.price && (
                    <>
                      <span className="text-muted-foreground line-through">MRP {formatINR(best.mrp)}</span>
                      <Pill tone="info">{best.discountPercent}% OFF</Pill>
                    </>
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground">Inclusive of all taxes</p>

              <h2 className="mt-6 mb-2 text-sm font-bold tracking-wide text-muted-foreground uppercase">
                Available from {offers.length} shop{offers.length > 1 ? "s" : ""}
              </h2>
              <ul className="space-y-2">
                {offers.map((o, i) => (
                  <li key={o.inventoryId} className={cn("flex items-center justify-between gap-3 rounded-2xl border p-3", i === 0 && o.orderable && "border-primary bg-secondary/40")}>
                    <div className="min-w-0">
                      <Link href={`/stores/${o.shopSlug}`} className="flex items-center gap-1.5 font-semibold hover:underline">
                        <Store className="size-4 shrink-0 text-primary" />
                        <span className="truncate">{o.shopName}</span>
                      </Link>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" /> {o.etaMinutes} min
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="size-3" /> {o.distanceKm.toFixed(1)} km
                        </span>
                        {o.variantName && <span>{o.variantName}</span>}
                        <span className={o.inStock ? "text-emerald-700" : "text-destructive"}>{o.stockLabel}</span>
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="text-right leading-tight">
                        <p className="font-bold">{formatINR(o.price)}</p>
                        {o.mrp > o.price && <p className="text-xs text-muted-foreground line-through">{formatINR(o.mrp)}</p>}
                      </div>
                      <AddButton inventoryId={o.inventoryId} maxQty={o.maxQty} disabled={!o.orderable} />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {product.description && (
            <div className="mt-8">
              <h2 className="mb-1 font-bold">Product details</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{product.description}</p>
            </div>
          )}
          <div className="mt-6 flex items-center gap-2 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 text-primary" /> Sold and fulfilled by verified local shops. Prices set by each shop.
          </div>
        </div>
      </div>
      <ProductRail title="You might also like" items={similar} />
    </div>
  );
}
