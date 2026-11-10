import "server-only";
import { db } from "@/server/db";
import { notFound } from "@/server/errors";
import type { LatLng } from "@/lib/geo";
import { discountPercent } from "@/lib/money";
import { unitLabel } from "@/lib/format";
import { eligibleShops, type EligibleShop } from "./location";
import type { Prisma } from "@/generated/prisma/client";

export interface Offer {
  inventoryId: string;
  shopId: string;
  shopName: string;
  shopSlug: string;
  variantId: string | null;
  variantName: string | null;
  mrp: number;
  price: number;
  discountPercent: number;
  inStock: boolean;
  stockLabel: string;
  maxQty: number;
  etaMinutes: number;
  distanceKm: number;
  orderable: boolean;
}

export interface ProductCard {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  unitLabel: string;
  imageUrl: string | null;
  categoryId: string;
  categoryName: string;
  best: Offer;
  offers: Offer[];
  createdAt: string;
}

const inventoryInclude = {
  product: {
    include: {
      images: { orderBy: { sortOrder: "asc" }, take: 1 },
      category: { select: { id: true, name: true } },
    },
  },
  variant: true,
} satisfies Prisma.ShopInventoryInclude;

type InvRow = Prisma.ShopInventoryGetPayload<{ include: typeof inventoryInclude }>;

const productVisible: Prisma.ProductWhereInput = { isActive: true, deletedAt: null, approvalStatus: "APPROVED" };

function stockLabel(stock: number, available: boolean) {
  if (!available || stock <= 0) return "Out of stock";
  if (stock <= 5) return `Only ${stock} left`;
  return "In stock";
}

function toOffer(row: InvRow, shop: EligibleShop): Offer {
  const inStock = row.isAvailable && row.stock > 0;
  return {
    inventoryId: row.id,
    shopId: shop.id,
    shopName: shop.name,
    shopSlug: shop.slug,
    variantId: row.variantId,
    variantName: row.variant?.name ?? null,
    mrp: row.mrp,
    price: row.sellingPrice,
    discountPercent: discountPercent(row.mrp, row.sellingPrice),
    inStock,
    stockLabel: stockLabel(row.stock, row.isAvailable),
    maxQty: Math.max(0, Math.min(row.stock, row.maxPerOrder)),
    etaMinutes: shop.etaMinutes,
    distanceKm: shop.distanceKm,
    orderable: inStock && shop.orderable,
  };
}

function rankOffers(a: Offer, b: Offer) {
  return Number(b.orderable) - Number(a.orderable) || a.price - b.price || a.etaMinutes - b.etaMinutes;
}

function groupCards(rows: InvRow[], shopMap: Map<string, EligibleShop>): ProductCard[] {
  const byProduct = new Map<string, { row: InvRow; offers: Offer[] }>();
  for (const row of rows) {
    const shop = shopMap.get(row.shopId);
    if (!shop) continue;
    const entry = byProduct.get(row.productId) ?? { row, offers: [] };
    entry.offers.push(toOffer(row, shop));
    byProduct.set(row.productId, entry);
  }
  return [...byProduct.values()].map(({ row, offers }) => {
    offers.sort(rankOffers);
    const p = row.product;
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      brand: p.brand,
      unitLabel: offers[0].variantName ?? unitLabel(p.unit, p.unitValue),
      imageUrl: p.images[0]?.url ?? null,
      categoryId: p.category.id,
      categoryName: p.category.name,
      best: offers[0],
      offers,
      createdAt: p.createdAt.toISOString(),
    };
  });
}

export type SortKey = "relevance" | "price_asc" | "price_desc" | "discount" | "newest" | "eta";

export interface BrowseQuery {
  q?: string;
  categoryId?: string;
  subcategoryId?: string;
  shopId?: string;
  sort?: SortKey;
  inStockOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export async function browseProducts(point: LatLng, query: BrowseQuery = {}) {
  const shops = await eligibleShops(point);
  const shopMap = new Map(shops.map((s) => [s.id, s]));
  const shopIds = query.shopId ? shops.filter((s) => s.id === query.shopId).map((s) => s.id) : shops.map((s) => s.id);
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 24;
  if (!shopIds.length) return { items: [] as ProductCard[], total: 0, page, pageSize, shops };

  const q = query.q?.trim();
  const productWhere: Prisma.ProductWhereInput = {
    ...productVisible,
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.subcategoryId ? { subcategoryId: query.subcategoryId } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { brand: { contains: q, mode: "insensitive" } },
            { category: { name: { contains: q, mode: "insensitive" } } },
            { subcategory: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const rows = await db.shopInventory.findMany({
    where: {
      shopId: { in: shopIds },
      deletedAt: null,
      ...(query.inStockOnly !== false ? { isAvailable: true, stock: { gt: 0 } } : {}),
      product: productWhere,
    },
    include: inventoryInclude,
    take: 3000,
  });
  let cards = groupCards(rows, shopMap);
  const sort = query.sort ?? (q ? "relevance" : "eta");
  const lower = q?.toLowerCase();
  cards.sort((a, b) => {
    switch (sort) {
      case "price_asc":
        return a.best.price - b.best.price;
      case "price_desc":
        return b.best.price - a.best.price;
      case "discount":
        return b.best.discountPercent - a.best.discountPercent;
      case "newest":
        return b.createdAt.localeCompare(a.createdAt);
      case "eta":
        return a.best.etaMinutes - b.best.etaMinutes || a.name.localeCompare(b.name);
      default: {
        const sa = lower && a.name.toLowerCase().startsWith(lower) ? 0 : 1;
        const sb = lower && b.name.toLowerCase().startsWith(lower) ? 0 : 1;
        return sa - sb || a.name.localeCompare(b.name);
      }
    }
  });
  const total = cards.length;
  cards = cards.slice((page - 1) * pageSize, page * pageSize);
  return { items: cards, total, page, pageSize, shops };
}

export async function productDetail(slug: string, point: LatLng | null) {
  const product = await db.product.findFirst({
    where: { OR: [{ slug }, { id: slug }], ...productVisible },
    include: {
      images: { orderBy: { sortOrder: "asc" } },
      category: true,
      subcategory: true,
      variants: { where: { isActive: true } },
    },
  });
  if (!product) throw notFound("Product");
  let offers: Offer[] = [];
  let similar: ProductCard[] = [];
  if (point) {
    const shops = await eligibleShops(point);
    const shopMap = new Map(shops.map((s) => [s.id, s]));
    const rows = await db.shopInventory.findMany({
      where: { productId: product.id, shopId: { in: shops.map((s) => s.id) }, deletedAt: null },
      include: inventoryInclude,
    });
    offers = rows.map((r) => toOffer(r, shopMap.get(r.shopId)!)).sort(rankOffers);
    const sim = await browseProducts(point, { categoryId: product.categoryId, pageSize: 12 });
    similar = sim.items.filter((c) => c.id !== product.id).slice(0, 10);
  }
  return { product, offers, similar };
}

export async function shopStorefront(slug: string, point: LatLng | null) {
  const shop = await db.shop.findFirst({
    where: { slug, approvalStatus: "APPROVED", isActive: true, deletedAt: null },
    include: { address: true, hours: { orderBy: { dayOfWeek: "asc" } }, category: true, images: true },
  });
  if (!shop) throw notFound("Shop");
  const reach = point ? (await eligibleShops(point)).find((s) => s.id === shop.id) ?? null : null;
  const products = reach ? await browseProducts(point!, { shopId: shop.id, pageSize: 500, inStockOnly: false, sort: "relevance" }) : null;
  return { shop, reach, products: products?.items ?? [] };
}

export async function homeFeed(point: LatLng, customerId: string | null) {
  const [shops, categories, banners] = await Promise.all([
    eligibleShops(point),
    db.category.findMany({ where: { isActive: true, deletedAt: null }, orderBy: { sortOrder: "asc" } }),
    db.banner.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }] },
        ],
      },
      orderBy: { sortOrder: "asc" },
    }),
  ]);
  if (!shops.length) return { shops, categories, banners, popular: [], deals: [], recent: [], recommended: [] };

  const all = await browseProducts(point, { pageSize: 3000 });
  const cards = all.items;
  const ids = cards.map((c) => c.id);

  const popularAgg = await db.orderItem.groupBy({
    by: ["productId"],
    where: {
      productId: { in: ids },
      order: { createdAt: { gte: new Date(Date.now() - 30 * 86400_000) }, status: { notIn: ["CANCELLED", "SHOP_REJECTED"] } },
    },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: "desc" } },
    take: 12,
  });
  const byId = new Map(cards.map((c) => [c.id, c]));
  let popular = popularAgg.map((p) => byId.get(p.productId)!).filter(Boolean);
  if (popular.length < 6) popular = [...popular, ...cards.filter((c) => !popular.includes(c))].slice(0, 12);

  const deals = [...cards].filter((c) => c.best.discountPercent > 0).sort((a, b) => b.best.discountPercent - a.best.discountPercent).slice(0, 12);
  const recent = [...cards].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12);

  let recommended: ProductCard[] = [];
  if (customerId) {
    const past = await db.orderItem.findMany({
      where: { order: { customerId } },
      select: { productId: true },
      orderBy: { order: { createdAt: "desc" } },
      take: 50,
    });
    const pastIds = new Set(past.map((p) => p.productId));
    const pastCats = new Set(cards.filter((c) => pastIds.has(c.id)).map((c) => c.categoryId));
    recommended = cards.filter((c) => pastCats.has(c.categoryId) && !pastIds.has(c.id)).slice(0, 12);
    const buyAgain = cards.filter((c) => pastIds.has(c.id));
    recommended = [...buyAgain.slice(0, 6), ...recommended].slice(0, 12);
  }
  if (!recommended.length) recommended = [...cards].sort((a, b) => b.best.discountPercent * 3 + a.best.etaMinutes - (a.best.discountPercent * 3 + b.best.etaMinutes)).slice(0, 12);

  return { shops, categories, banners, popular, deals, recent, recommended };
}
