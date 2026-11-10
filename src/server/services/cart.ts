import "server-only";
import { db, type DbOrTx } from "@/server/db";
import { badRequest, conflict, notFound } from "@/server/errors";
import type { LatLng } from "@/lib/geo";
import { unitLabel } from "@/lib/format";
import { checkCoupon } from "./coupon";
import { computeQuote, type PricingConfig, type Quote } from "./pricing";
import { eligibleShops } from "./location";
import { getSettings, type PlatformSettings } from "./settings";

export function pricingConfig(settings: PlatformSettings, shopCommissionBps: number | null): PricingConfig {
  return {
    delivery: settings.delivery,
    tax: settings.tax,
    order: settings.order,
    coupons: settings.coupons,
    commissionBps: shopCommissionBps ?? settings.commission.defaultBps,
  };
}

const cartInclude = {
  items: {
    orderBy: { createdAt: "asc" as const },
    include: {
      inventory: {
        include: {
          variant: true,
          product: { include: { images: { orderBy: { sortOrder: "asc" as const }, take: 1 }, category: true } },
        },
      },
      shop: { include: { address: true } },
    },
  },
};

async function ensureCart(customerId: string, client: DbOrTx = db) {
  return client.cart.upsert({ where: { customerId }, create: { customerId }, update: {}, select: { id: true } });
}

export interface CartView {
  id: string;
  shop: { id: string; name: string; slug: string; logoUrl: string | null; etaMinutes: number | null; distanceKm: number | null; orderable: boolean; deliversHere: boolean } | null;
  items: {
    id: string;
    inventoryId: string;
    productId: string;
    productSlug: string;
    name: string;
    unitLabel: string;
    imageUrl: string | null;
    quantity: number;
    mrp: number;
    price: number;
    lineTotal: number;
    maxQty: number;
    issue: string | null;
  }[];
  couponCode: string | null;
  quote: Quote;
  canCheckout: boolean;
  blockers: string[];
}

export async function getCartView(customerId: string, point: LatLng | null): Promise<CartView> {
  await ensureCart(customerId);
  const cart = await db.cart.findUniqueOrThrow({ where: { customerId }, include: cartInclude });
  const settings = await getSettings();
  const shopRow = cart.items[0]?.shop ?? null;

  let reach: Awaited<ReturnType<typeof eligibleShops>>[number] | null = null;
  if (shopRow && point) reach = (await eligibleShops(point)).find((s) => s.id === shopRow.id) ?? null;

  const items: CartView["items"] = cart.items.map((it) => {
    const inv = it.inventory;
    const p = inv.product;
    let issue: string | null = null;
    if (inv.deletedAt || !inv.isAvailable || !p.isActive || p.deletedAt || p.approvalStatus !== "APPROVED") issue = "No longer available";
    else if (inv.stock <= 0) issue = "Out of stock";
    else if (it.quantity > inv.stock) issue = `Only ${inv.stock} left`;
    else if (it.quantity > inv.maxPerOrder) issue = `Max ${inv.maxPerOrder} per order`;
    return {
      id: it.id,
      inventoryId: inv.id,
      productId: p.id,
      productSlug: p.slug,
      name: p.name,
      unitLabel: inv.variant?.name ?? unitLabel(p.unit, p.unitValue),
      imageUrl: p.images[0]?.url ?? null,
      quantity: it.quantity,
      mrp: inv.mrp,
      price: inv.sellingPrice,
      lineTotal: inv.sellingPrice * it.quantity,
      maxQty: Math.max(0, Math.min(inv.stock, inv.maxPerOrder)),
      issue,
    };
  });

  const lines = cart.items.map((it) => ({
    mrp: it.inventory.mrp,
    price: it.inventory.sellingPrice,
    quantity: it.quantity,
    taxRateBps: it.inventory.product.category.taxRateBps ?? settings.tax.defaultRateBps,
  }));
  let coupon = null;
  let couponError: string | null = null;
  if (cart.couponCode && shopRow) {
    const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);
    const res = await checkCoupon(cart.couponCode, { customerId, shopId: shopRow.id, subtotal });
    if (res.ok) coupon = res.rule;
    else couponError = res.error;
  }
  const quote = computeQuote(lines, pricingConfig(settings, shopRow?.commissionBps ?? null), {
    distanceKm: reach?.distanceKm ?? 2,
    coupon,
    couponError,
  });

  const blockers: string[] = [];
  if (!items.length) blockers.push("Your cart is empty");
  if (items.some((i) => i.issue)) blockers.push("Some items need your attention");
  if (shopRow && point && !reach) blockers.push(`${shopRow.name} does not deliver to your selected location`);
  if (reach && !reach.orderable) blockers.push(`${shopRow!.name} is currently closed`);
  if (items.length && !quote.meetsMinimum)
    blockers.push(`Minimum order is ₹${(quote.minOrderAmount / 100).toFixed(0)}`);

  return {
    id: cart.id,
    shop: shopRow
      ? {
          id: shopRow.id,
          name: shopRow.name,
          slug: shopRow.slug,
          logoUrl: shopRow.logoUrl,
          etaMinutes: reach?.etaMinutes ?? null,
          distanceKm: reach?.distanceKm ?? null,
          orderable: reach?.orderable ?? false,
          deliversHere: !!reach,
        }
      : null,
    items,
    couponCode: cart.couponCode,
    quote,
    canCheckout: blockers.length === 0,
    blockers,
  };
}

export async function addToCart(customerId: string, inventoryId: string, quantity: number, replaceCart: boolean) {
  const inv = await db.shopInventory.findUnique({
    where: { id: inventoryId },
    include: { product: true, shop: { select: { id: true, name: true, approvalStatus: true, isActive: true, deletedAt: true } } },
  });
  if (!inv || inv.deletedAt || !inv.product.isActive || inv.product.deletedAt || inv.product.approvalStatus !== "APPROVED")
    throw notFound("Product");
  if (inv.shop.approvalStatus !== "APPROVED" || !inv.shop.isActive || inv.shop.deletedAt)
    throw badRequest("This shop is not currently accepting orders");
  if (!inv.isAvailable || inv.stock <= 0) throw conflict("This item is out of stock");

  const cart = await ensureCart(customerId);
  const existing = await db.cartItem.findMany({ where: { cartId: cart.id }, include: { shop: { select: { name: true } } } });
  const otherShop = existing.find((i) => i.shopId !== inv.shopId);
  if (otherShop) {
    if (!replaceCart) {
      throw conflict("Your cart has items from another shop", {
        reason: "CART_SHOP_CONFLICT",
        currentShop: otherShop.shop.name,
        newShop: inv.shop.name,
      });
    }
    await db.$transaction([
      db.cartItem.deleteMany({ where: { cartId: cart.id } }),
      db.cart.update({ where: { id: cart.id }, data: { couponCode: null } }),
    ]);
  }
  const current = existing.find((i) => i.inventoryId === inventoryId && !otherShop)?.quantity ?? 0;
  const next = current + quantity;
  const max = Math.min(inv.stock, inv.maxPerOrder);
  if (next > max) throw conflict(max === inv.stock ? `Only ${inv.stock} in stock` : `You can order at most ${inv.maxPerOrder} of this item`);
  await db.cartItem.upsert({
    where: { cartId_inventoryId: { cartId: cart.id, inventoryId } },
    create: { cartId: cart.id, inventoryId, shopId: inv.shopId, quantity: next },
    update: { quantity: next },
  });
}

export async function setCartQuantity(customerId: string, inventoryId: string, quantity: number) {
  const cart = await ensureCart(customerId);
  if (quantity <= 0) {
    await db.cartItem.deleteMany({ where: { cartId: cart.id, inventoryId } });
  } else {
    const inv = await db.shopInventory.findUnique({ where: { id: inventoryId } });
    if (!inv) throw notFound("Product");
    const max = Math.min(inv.stock, inv.maxPerOrder);
    if (quantity > max) throw conflict(max === inv.stock ? `Only ${inv.stock} in stock` : `You can order at most ${inv.maxPerOrder}`);
    const updated = await db.cartItem.updateMany({ where: { cartId: cart.id, inventoryId }, data: { quantity } });
    if (updated.count === 0) throw notFound("Cart item");
  }
  const remaining = await db.cartItem.count({ where: { cartId: cart.id } });
  if (!remaining) await db.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
}

export async function clearCart(customerId: string, client: DbOrTx = db) {
  const cart = await ensureCart(customerId, client);
  await client.cartItem.deleteMany({ where: { cartId: cart.id } });
  await client.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
}

export async function applyCoupon(customerId: string, code: string | null) {
  const cart = await ensureCart(customerId);
  if (!code) {
    await db.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
    return;
  }
  const settings = await getSettings();
  if (!settings.coupons.enabled) throw badRequest("Coupons are currently disabled");
  const items = await db.cartItem.findMany({ where: { cartId: cart.id }, include: { inventory: true } });
  if (!items.length) throw badRequest("Add items to your cart first");
  const subtotal = items.reduce((s, i) => s + i.inventory.sellingPrice * i.quantity, 0);
  const res = await checkCoupon(code, { customerId, shopId: items[0].shopId, subtotal });
  if (!res.ok) throw badRequest(res.error);
  await db.cart.update({ where: { id: cart.id }, data: { couponCode: res.rule.code } });
}
