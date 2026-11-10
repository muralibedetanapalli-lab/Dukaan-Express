"use client";

import Link from "next/link";
import { Clock, Store } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";
import { AddButton } from "./add-button";

export interface OfferLite {
  inventoryId: string;
  shopName: string;
  shopSlug: string;
  variantName: string | null;
  mrp: number;
  price: number;
  discountPercent: number;
  inStock: boolean;
  stockLabel: string;
  maxQty: number;
  etaMinutes: number;
  orderable: boolean;
}

export interface ProductCardData {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  unitLabel: string;
  imageUrl: string | null;
  best: OfferLite;
  offers: OfferLite[];
}

export function ProductCard({ p, className }: { p: ProductCardData; className?: string }) {
  const o = p.best;
  const others = p.offers.length - 1;
  return (
    <div className={cn("group flex flex-col rounded-2xl border bg-card p-2.5 transition hover:shadow-lg", className)}>
      <Link href={`/product/${p.slug}`} className="relative block aspect-square overflow-hidden rounded-xl bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {p.imageUrl && <img src={p.imageUrl} alt={p.name} loading="lazy" className="size-full object-cover transition group-hover:scale-105" />}
        {o.discountPercent > 0 && (
          <span className="absolute top-0 left-2 rounded-b-md bg-blue-600 px-1.5 pt-0.5 pb-1 text-[10px] leading-tight font-extrabold text-white">
            {o.discountPercent}%<br />OFF
          </span>
        )}
        {!o.inStock && <span className="absolute inset-x-0 bottom-0 bg-black/60 py-1 text-center text-xs font-semibold text-white">Out of stock</span>}
      </Link>
      <div className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
        <Clock className="size-3" /> {o.etaMinutes} mins
      </div>
      <Link href={`/product/${p.slug}`} className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 font-semibold">
        {p.name}
      </Link>
      <p className="text-xs text-muted-foreground">{p.unitLabel}</p>
      <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
        <Store className="size-3 shrink-0" />
        <span className="truncate">{o.shopName}</span>
        {others > 0 && (
          <Popover>
            <PopoverTrigger className="shrink-0 rounded-full bg-secondary px-1.5 font-semibold text-secondary-foreground">+{others}</PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="start">
              <p className="border-b px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Available at {p.offers.length} shops</p>
              <ul className="divide-y">
                {p.offers.map((x) => (
                  <li key={x.inventoryId} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{x.shopName}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatINR(x.price)} · {x.etaMinutes} min{x.variantName ? ` · ${x.variantName}` : ""}
                      </p>
                    </div>
                    <AddButton inventoryId={x.inventoryId} maxQty={x.maxQty} disabled={!x.orderable} />
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        )}
      </div>
      <div className="mt-auto flex items-end justify-between gap-2 pt-2">
        <div className="leading-tight">
          <p className="text-sm font-bold">{formatINR(o.price)}</p>
          {o.mrp > o.price && <p className="text-xs text-muted-foreground line-through">{formatINR(o.mrp)}</p>}
        </div>
        <AddButton inventoryId={o.inventoryId} maxQty={o.maxQty} disabled={!o.orderable} />
      </div>
    </div>
  );
}

export function ProductGrid({ items }: { items: ProductCardData[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {items.map((p) => (
        <ProductCard key={p.id} p={p} />
      ))}
    </div>
  );
}

export function ProductRail({ title, items, href }: { title: string; items: ProductCardData[]; href?: string }) {
  if (!items.length) return null;
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-end justify-between">
        <h2 className="text-lg font-bold">{title}</h2>
        {href && (
          <Link href={href} className="text-sm font-semibold text-primary">
            See all
          </Link>
        )}
      </div>
      <div className="scrollbar-none -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
        {items.map((p) => (
          <ProductCard key={p.id} p={p} className="w-40 shrink-0 snap-start sm:w-44" />
        ))}
      </div>
    </section>
  );
}
