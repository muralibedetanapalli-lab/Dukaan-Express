import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { AppError, badRequest, conflict, forbidden, notFound } from "@/server/errors";
import type { SessionUser } from "@/server/auth/session";
import {
  cashfreeEnv,
  createCashfreeOrder,
  createCashfreeRefund,
  fetchCashfreeOrder,
  fetchCashfreePayments,
  isCashfreeLive,
  toPaise,
} from "@/server/integrations/cashfree";
import type { Prisma, BulkOrderStatus } from "@/generated/prisma/client";
import { applyBps, formatINR } from "@/lib/money";
import { unitLabel } from "@/lib/format";
import { haversineKm } from "@/lib/geo";
import { audit } from "./audit";
import { activeShopFor } from "./inventory";
import { notifyAdmins, notifyShop } from "./notification";
import { getSettings } from "./settings";
import type { CheckoutOptions, PaymentOutcome } from "./payment";

/**
 * Shop-to-shop bulk (B2B) orders.
 * - A shop opts in as a wholesaler (`Shop.sellsBulk`) and gives products a bulk price and minimum quantity.
 * - Any live shop can buy from wholesalers: pay online (Cashfree, money held by the platform and paid out to the
 *   seller with their normal payouts) or pay the seller on delivery / pickup.
 * - The seller delivers it or the buyer picks it up. Stock is reserved when the seller accepts.
 * - On handover a Commission row is written at the B2B rate (settings.commission.b2bBps); the seller's dealer gets
 *   their usual share. Online: the seller earns items − commission + delivery fee. On delivery: the seller already
 *   holds the cash, so their balance is charged the commission (negative earning).
 *
 * Status: PAYMENT_PENDING → PLACED → ACCEPTED → DISPATCHED | READY_FOR_PICKUP → DELIVERED
 *         PLACED → REJECTED (seller) · PAYMENT_PENDING | PLACED → CANCELLED (buyer) · ACCEPTED → CANCELLED (seller)
 */

const actorOf = (u: SessionUser) => ({ id: u.id, role: u.role });
const isMock = (gatewayOrderId: string | null) => !gatewayOrderId || gatewayOrderId.startsWith("MOCK_");

function newBulkNumber() {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `BLK${ymd}${randomBytes(3).toString("hex").toUpperCase()}`;
}

// ───────────────────────────── Seller: wholesale settings ─────────────────────────────

export const zBulkSettings = z.object({
  sellsBulk: z.boolean(),
  bulkMinOrder: z.number().int().min(0).max(100_000_00),
  bulkDelivers: z.boolean(),
  bulkDeliveryFee: z.number().int().min(0).max(10_000_00),
  bulkPickup: z.boolean(),
  bulkPayOnDelivery: z.boolean(),
});

export async function updateBulkSettings(user: SessionUser, input: z.infer<typeof zBulkSettings>) {
  const { shop } = await activeShopFor(user);
  if (input.sellsBulk && !input.bulkDelivers && !input.bulkPickup) throw badRequest("Offer delivery, pickup or both");
  await db.shop.update({ where: { id: shop.id }, data: input });
  await audit(actorOf(user), "shop.bulk_settings", "Shop", shop.id, { after: input });
  return { ok: true };
}

export const zBulkPrices = z.object({
  items: z
    .array(
      z.object({ inventoryId: z.string(), bulkPrice: z.number().int().min(100).max(10_000_000).nullable(), bulkMinQty: z.number().int().min(1).max(10_000) }),
    )
    .min(1)
    .max(500),
});

/** Set or clear wholesale prices for the shop's own products. */
export async function setBulkPrices(user: SessionUser, input: z.infer<typeof zBulkPrices>) {
  const { shop } = await activeShopFor(user);
  const ids = input.items.map((i) => i.inventoryId);
  const own = await db.shopInventory.findMany({
    where: { id: { in: ids }, shopId: shop.id, deletedAt: null },
    select: { id: true, mrp: true, product: { select: { name: true } } },
  });
  const byId = new Map(own.map((o) => [o.id, o]));
  for (const i of input.items) {
    const inv = byId.get(i.inventoryId);
    if (!inv) throw notFound("Product");
    if (i.bulkPrice != null && i.bulkPrice > inv.mrp) throw badRequest(`Bulk price for ${inv.product.name} can't be above its MRP`);
  }
  await db.$transaction(
    input.items.map((i) => db.shopInventory.update({ where: { id: i.inventoryId }, data: { bulkPrice: i.bulkPrice, bulkMinQty: i.bulkMinQty } })),
  );
  await audit(actorOf(user), "shop.bulk_prices", "Shop", shop.id, { after: { count: input.items.length } });
  return { updated: input.items.length };
}

// ───────────────────────────── Buyer: market ─────────────────────────────

const liveShop = { deletedAt: null, isActive: true, approvalStatus: "APPROVED" as const, agreementAcceptedAt: { not: null } };
const bulkItemWhere = { deletedAt: null, isAvailable: true, bulkPrice: { not: null } };

/** Wholesalers a shop can buy from, nearest first. */
export async function wholesalers(buyerShopId: string, q?: string) {
  const buyer = await db.shop.findUniqueOrThrow({ where: { id: buyerShopId }, include: { address: true } });
  const shops = await db.shop.findMany({
    where: {
      ...liveShop,
      sellsBulk: true,
      id: { not: buyerShopId },
      inventory: { some: bulkItemWhere },
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { inventory: { some: { ...bulkItemWhere, product: { name: { contains: q, mode: "insensitive" } } } } },
            ],
          }
        : {}),
    },
    include: { address: true, category: { select: { name: true } }, _count: { select: { inventory: { where: bulkItemWhere } } } },
    take: 100,
  });
  return shops
    .map((s) => ({
      id: s.id,
      name: s.name,
      logoUrl: s.logoUrl,
      category: s.category?.name ?? null,
      city: s.address?.city ?? "",
      pincode: s.address?.pincode ?? "",
      distanceKm:
        buyer.address && s.address
          ? haversineKm({ lat: buyer.address.latitude, lng: buyer.address.longitude }, { lat: s.address.latitude, lng: s.address.longitude })
          : null,
      products: s._count.inventory,
      minOrder: s.bulkMinOrder,
      delivers: s.bulkDelivers,
      deliveryFee: s.bulkDeliveryFee,
      pickup: s.bulkPickup,
      payOnDelivery: s.bulkPayOnDelivery,
      rating: s.ratingCount ? s.rating : null,
    }))
    .sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
}

/** One wholesaler's bulk catalogue. */
export async function wholesalerCatalog(buyerShopId: string, sellerShopId: string) {
  if (buyerShopId === sellerShopId) throw badRequest("You can't buy from your own shop");
  const shop = await db.shop.findFirst({ where: { id: sellerShopId, ...liveShop, sellsBulk: true }, include: { address: true } });
  if (!shop) throw notFound("Wholesaler");
  const items = await db.shopInventory.findMany({
    where: { shopId: shop.id, ...bulkItemWhere },
    include: { product: { include: { category: { select: { name: true } }, images: { orderBy: { sortOrder: "asc" }, take: 1 } } }, variant: true },
    orderBy: [{ product: { category: { sortOrder: "asc" } } }, { product: { name: "asc" } }],
  });
  return {
    shop: {
      id: shop.id,
      name: shop.name,
      logoUrl: shop.logoUrl,
      address: shop.address ? `${shop.address.line1}, ${shop.address.city} ${shop.address.pincode}` : "",
      phone: shop.contactPhone,
      minOrder: shop.bulkMinOrder,
      delivers: shop.bulkDelivers,
      deliveryFee: shop.bulkDeliveryFee,
      pickup: shop.bulkPickup,
      payOnDelivery: shop.bulkPayOnDelivery,
    },
    items: items.map((i) => ({
      inventoryId: i.id,
      name: i.product.name,
      variant: i.variant?.name ?? null,
      unit: unitLabel(i.product.unit, i.product.unitValue),
      category: i.product.category.name,
      image: i.product.images[0]?.url ?? null,
      mrp: i.mrp,
      retailPrice: i.sellingPrice,
      bulkPrice: i.bulkPrice!,
      minQty: i.bulkMinQty,
      stock: i.stock,
    })),
  };
}

// ───────────────────────────── Buyer: place & pay ─────────────────────────────

export const zPlaceBulk = z.object({
  sellerShopId: z.string(),
  items: z
    .array(z.object({ inventoryId: z.string(), quantity: z.number().int().min(1).max(100_000) }))
    .min(1)
    .max(200),
  fulfilment: z.enum(["DELIVERY", "PICKUP"]),
  paymentMethod: z.enum(["ONLINE", "ON_DELIVERY"]),
  note: z.string().trim().max(500).optional().nullable(),
});

export async function placeBulkOrder(user: SessionUser, input: z.infer<typeof zPlaceBulk>) {
  const { shop: buyer } = await activeShopFor(user);
  if (!buyer.isActive || !buyer.agreementAcceptedAt) throw badRequest("Your shop must be live to place bulk orders");
  if (buyer.id === input.sellerShopId) throw badRequest("You can't buy from your own shop");
  const seller = await db.shop.findFirst({ where: { id: input.sellerShopId, ...liveShop, sellsBulk: true } });
  if (!seller) throw notFound("Wholesaler");
  if (input.fulfilment === "DELIVERY" && !seller.bulkDelivers) throw badRequest(`${seller.name} doesn't deliver bulk orders. Choose pickup.`);
  if (input.fulfilment === "PICKUP" && !seller.bulkPickup) throw badRequest(`${seller.name} doesn't offer pickup. Choose delivery.`);
  if (input.paymentMethod === "ON_DELIVERY" && !seller.bulkPayOnDelivery) throw badRequest(`${seller.name} takes online payment only`);

  const qty = new Map<string, number>();
  for (const i of input.items) qty.set(i.inventoryId, (qty.get(i.inventoryId) ?? 0) + i.quantity);
  const inv = await db.shopInventory.findMany({
    where: { id: { in: [...qty.keys()] }, shopId: seller.id, ...bulkItemWhere },
    include: { product: { include: { images: { orderBy: { sortOrder: "asc" }, take: 1 } } }, variant: true },
  });
  if (inv.length !== qty.size) throw conflict("Some products are no longer sold in bulk. Refresh and try again.");
  const lines = inv.map((i) => {
    const q = qty.get(i.id)!;
    if (q < i.bulkMinQty) throw badRequest(`Minimum for ${i.product.name} is ${i.bulkMinQty}`);
    if (q > i.stock) throw conflict(`Only ${i.stock} of ${i.product.name} in stock`);
    return {
      inventoryId: i.id,
      productName: i.product.name,
      variantName: i.variant?.name ?? null,
      unitLabel: unitLabel(i.product.unit, i.product.unitValue),
      imageUrl: i.product.images[0]?.url ?? null,
      quantity: q,
      unitPrice: i.bulkPrice!,
      lineTotal: i.bulkPrice! * q,
    };
  });
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  if (subtotal < seller.bulkMinOrder) throw badRequest(`Minimum bulk order at ${seller.name} is ${formatINR(seller.bulkMinOrder)}`);
  const deliveryFee = input.fulfilment === "DELIVERY" ? seller.bulkDeliveryFee : 0;
  const a = buyer.address;
  const order = await db.bulkOrder.create({
    data: {
      number: newBulkNumber(),
      buyerShopId: buyer.id,
      sellerShopId: seller.id,
      status: input.paymentMethod === "ONLINE" ? "PAYMENT_PENDING" : "PLACED",
      fulfilment: input.fulfilment,
      paymentMethod: input.paymentMethod,
      itemCount: lines.reduce((s, l) => s + l.quantity, 0),
      subtotal,
      deliveryFee,
      total: subtotal + deliveryFee,
      note: input.note || null,
      buyerAddress: {
        shopName: buyer.name,
        phone: buyer.contactPhone,
        line1: a?.line1 ?? "",
        line2: a?.line2 ?? null,
        landmark: a?.landmark ?? null,
        city: a?.city ?? "",
        state: a?.state ?? "",
        pincode: a?.pincode ?? "",
        latitude: a?.latitude ?? null,
        longitude: a?.longitude ?? null,
      },
      placedById: user.id,
      items: { create: lines },
    },
  });
  await audit(actorOf(user), "bulk.place", "BulkOrder", order.id, {
    after: { number: order.number, seller: seller.id, total: order.total, payment: input.paymentMethod },
  });
  if (order.status === "PLACED") await announce(order.id);
  return { id: order.id, number: order.number, status: order.status, total: order.total };
}

async function announce(id: string) {
  const o = await db.bulkOrder.findUniqueOrThrow({ where: { id }, include: { buyerShop: { select: { name: true } } } });
  await notifyShop(o.sellerShopId, {
    type: "BULK_ORDER",
    title: "New bulk order",
    body: `${o.buyerShop.name} ordered ${o.itemCount} units (${formatINR(o.total)}${o.paymentMethod === "ONLINE" ? ", paid online" : ", pay on delivery"}). Accept it to reserve stock.`,
    link: `/shop/bulk/orders/${o.id}`,
  });
}

async function buyerOrder(user: SessionUser, id: string) {
  const { shops } = await activeShopFor(user);
  const o = await db.bulkOrder.findUnique({ where: { id } });
  if (!o || !shops.some((s) => s.id === o.buyerShopId)) throw notFound("Bulk order");
  return o;
}

async function sellerOrder(user: SessionUser, id: string) {
  const { shops } = await activeShopFor(user);
  const o = await db.bulkOrder.findUnique({ where: { id }, include: { items: true } });
  if (!o || !shops.some((s) => s.id === o.sellerShopId)) throw notFound("Bulk order");
  return o;
}

/** Create (or reuse) the Cashfree order for an unpaid online bulk order. */
export async function startBulkPayment(user: SessionUser, id: string): Promise<CheckoutOptions> {
  const o = await buyerOrder(user, id);
  if (o.status !== "PAYMENT_PENDING") throw conflict("This order does not need payment");
  const live = isCashfreeLive();
  const settings = await getSettings();
  const options = (gatewayOrderId: string, paymentSessionId: string): CheckoutOptions => ({
    mode: live ? "live" : "sandbox",
    cashfreeMode: cashfreeEnv(),
    paymentSessionId,
    gatewayOrderId,
    amount: o.total,
    currency: "INR",
    orderNumber: o.number,
    name: settings.platform.name,
  });
  if (o.gatewayOrderId && live !== isMock(o.gatewayOrderId)) {
    if (!live) return options(o.gatewayOrderId, "session_MOCK");
    const cf = await fetchCashfreeOrder(o.gatewayOrderId).catch(() => null);
    if (cf?.order_status === "PAID") {
      await syncBulkPayment(o.id);
      throw conflict("This order is already paid");
    }
    if (cf?.order_status === "ACTIVE") return options(o.gatewayOrderId, cf.payment_session_id);
  }
  const appUrl = env().APP_URL.replace(/\/$/, "");
  const gatewayOrderId = `${live ? "" : "MOCK_"}${o.number}_${randomBytes(3).toString("hex")}`;
  const buyer = await db.shop.findUniqueOrThrow({ where: { id: o.buyerShopId }, include: { owner: { include: { user: true } } } });
  const cf = await createCashfreeOrder({
    orderId: gatewayOrderId,
    amountPaise: o.total,
    customer: { id: `shop_${buyer.id}`, phone: buyer.contactPhone, name: buyer.name, email: buyer.owner?.user.email ?? null },
    returnUrl: `${appUrl}/shop/bulk/orders/${o.id}?payment=return`,
    notifyUrl: appUrl.startsWith("https://") ? `${appUrl}/api/v1/webhooks/cashfree` : undefined,
    note: `Bulk order ${o.number}`,
  });
  await db.bulkOrder.update({ where: { id: o.id }, data: { gatewayOrderId } });
  return options(gatewayOrderId, cf.payment_session_id);
}

/** Payment confirmed (gateway, webhook or sandbox): the order goes to the seller. Idempotent. */
export async function markBulkPaid(id: string, gatewayPaymentId: string) {
  const done = await db.bulkOrder.updateMany({
    where: { id, paymentStatus: { in: ["PENDING", "FAILED"] } },
    data: { paymentStatus: "CAPTURED", gatewayPaymentId, paidAt: new Date() },
  });
  if (done.count === 0) return;
  const o = await db.bulkOrder.findUniqueOrThrow({ where: { id } });
  if (o.status === "PAYMENT_PENDING") {
    await db.bulkOrder.update({ where: { id }, data: { status: "PLACED" } });
    await notifyShop(o.buyerShopId, {
      type: "PAYMENT_CONFIRMED",
      title: "Bulk order paid",
      body: `We received ${formatINR(o.total)} for ${o.number}. It's now with the seller.`,
      link: `/shop/bulk/orders/${o.id}`,
    });
    await announce(o.id);
  } else if (o.status === "CANCELLED") {
    await refundBulk(o.id, "Payment received after the order was cancelled");
  }
  await audit({ id: null, role: "SYSTEM" }, "bulk.paid", "BulkOrder", id, { after: { gatewayPaymentId } });
}

/** Ask Cashfree how the latest payment attempt ended (never trusts the browser). */
export async function syncBulkPayment(id: string): Promise<PaymentOutcome> {
  const o = await db.bulkOrder.findUniqueOrThrow({ where: { id } });
  if (o.paymentStatus === "CAPTURED" || o.paymentStatus === "REFUNDED") return "paid";
  if (!o.gatewayOrderId || isMock(o.gatewayOrderId)) return "pending";
  const cf = await fetchCashfreeOrder(o.gatewayOrderId);
  if (toPaise(cf.order_amount) !== o.total) throw new AppError(400, "PAYMENT_MISMATCH", "Payment does not match this order");
  if (cf.order_status === "PAID") {
    const ok = (await fetchCashfreePayments(o.gatewayOrderId)).find((a) => a.payment_status === "SUCCESS");
    await markBulkPaid(o.id, String(ok?.cf_payment_id ?? cf.cf_order_id));
    return "paid";
  }
  const attempts = await fetchCashfreePayments(o.gatewayOrderId);
  if (attempts.some((a) => a.payment_status === "PENDING")) return "pending";
  if (attempts.some((a) => a.payment_status === "FAILED")) return "failed";
  return "pending";
}

export async function verifyBulkPayment(user: SessionUser, id: string, input: { gatewayOrderId?: string; sandboxOutcome?: "success" | "failure" }) {
  const o = await buyerOrder(user, id);
  if (input.gatewayOrderId && input.gatewayOrderId !== o.gatewayOrderId) throw notFound("Payment");
  let outcome: PaymentOutcome;
  if (o.paymentStatus === "CAPTURED") outcome = "paid";
  else if (!isMock(o.gatewayOrderId)) outcome = await syncBulkPayment(o.id);
  else if (!input.sandboxOutcome || !o.gatewayOrderId) outcome = "pending";
  else {
    if (isCashfreeLive()) throw badRequest("Sandbox payments are disabled");
    if (input.sandboxOutcome === "failure") outcome = "failed";
    else {
      await markBulkPaid(o.id, `cf_MOCK${randomBytes(6).toString("hex")}`);
      outcome = "paid";
    }
  }
  return { outcome };
}

// ───────────────────────────── Refunds ─────────────────────────────

async function refundBulk(id: string, reason: string) {
  const o = await db.bulkOrder.findUniqueOrThrow({ where: { id } });
  if (o.paymentMethod !== "ONLINE" || o.paymentStatus !== "CAPTURED" || !o.gatewayOrderId || o.refundId) return;
  const refundId = `BLKR_${o.number}`;
  await db.bulkOrder.update({ where: { id }, data: { refundId, refundStatus: "PENDING" } });
  try {
    const r = await createCashfreeRefund(o.gatewayOrderId, refundId, o.total, reason, isMock(o.gatewayOrderId));
    if (r.refund_status === "SUCCESS") await markBulkRefunded(refundId);
  } catch (e) {
    await db.bulkOrder.update({ where: { id }, data: { refundStatus: "FAILED" } });
    await notifyAdmins({ type: "REFUND", title: "Bulk order refund failed", body: `${o.number}: ${(e as Error).message}`, link: "/admin/bulk-orders" });
  }
}

export async function markBulkRefunded(refundId: string) {
  const o = await db.bulkOrder.findUnique({ where: { refundId } });
  if (!o || o.refundStatus === "SUCCESS") return;
  await db.bulkOrder.update({ where: { id: o.id }, data: { refundStatus: "SUCCESS", paymentStatus: "REFUNDED" } });
  await notifyShop(o.buyerShopId, {
    type: "REFUND",
    title: "Bulk order refunded",
    body: `${formatINR(o.total)} for ${o.number} is on its way back to you.`,
    link: `/shop/bulk/orders/${o.id}`,
  });
}

export async function markBulkRefundFailed(refundId: string) {
  await db.bulkOrder.updateMany({ where: { refundId, refundStatus: "PENDING" }, data: { refundStatus: "FAILED" } });
}

// ───────────────────────────── Status changes ─────────────────────────────

async function move(id: string, from: BulkOrderStatus[], data: Prisma.BulkOrderUpdateManyMutationInput) {
  const r = await db.bulkOrder.updateMany({ where: { id, status: { in: from } }, data });
  if (r.count !== 1) throw conflict("This order was just updated. Refresh to see its status.");
}

export type SellerAction =
  | { action: "accept" }
  | { action: "reject"; reason: string }
  | { action: "dispatch" }
  | { action: "ready" }
  | { action: "delivered" }
  | { action: "cancel"; reason: string };

export async function sellerBulkAction(user: SessionUser, id: string, a: SellerAction) {
  const o = await sellerOrder(user, id);
  const link = `/shop/bulk/orders/${o.id}`;
  switch (a.action) {
    case "accept": {
      if (o.status !== "PLACED") throw conflict("Only new orders can be accepted");
      await db.$transaction(async (tx) => {
        for (const it of o.items) {
          const r = await tx.shopInventory.updateMany({
            where: { id: it.inventoryId, stock: { gte: it.quantity } },
            data: { stock: { decrement: it.quantity } },
          });
          if (r.count !== 1) throw conflict(`Not enough stock of ${it.productName} (${it.quantity} needed). Update your stock or reject the order.`);
        }
        const r = await tx.bulkOrder.updateMany({ where: { id, status: "PLACED" }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
        if (r.count !== 1) throw conflict("This order was just updated. Refresh to see its status.");
      });
      await notifyShop(o.buyerShopId, { type: "BULK_ORDER", title: "Bulk order accepted", body: `${o.number} was accepted by the seller.`, link });
      break;
    }
    case "reject":
      await move(id, ["PLACED"], { status: "REJECTED", rejectReason: a.reason, cancelledAt: new Date(), cancelledBy: "SELLER" });
      await refundBulk(id, "Rejected by seller");
      await notifyShop(o.buyerShopId, {
        type: "BULK_ORDER",
        title: "Bulk order rejected",
        body: `${o.number}: ${a.reason}${o.paymentStatus === "CAPTURED" ? ". Your payment will be refunded." : ""}`,
        link,
      });
      break;
    case "dispatch":
      if (o.fulfilment !== "DELIVERY") throw badRequest("This order is for pickup");
      await move(id, ["ACCEPTED"], { status: "DISPATCHED", dispatchedAt: new Date() });
      await notifyShop(o.buyerShopId, { type: "BULK_ORDER", title: "Bulk order on the way", body: `${o.number} is out for delivery.`, link });
      break;
    case "ready":
      if (o.fulfilment !== "PICKUP") throw badRequest("This order is for delivery");
      await move(id, ["ACCEPTED"], { status: "READY_FOR_PICKUP", dispatchedAt: new Date() });
      await notifyShop(o.buyerShopId, { type: "BULK_ORDER", title: "Ready for pickup", body: `${o.number} is packed and ready to collect.`, link });
      break;
    case "delivered":
      await complete(id, o.fulfilment === "DELIVERY" ? ["DISPATCHED"] : ["READY_FOR_PICKUP"]);
      break;
    case "cancel":
      if (o.status !== "ACCEPTED") throw conflict("Only accepted orders can be cancelled by the seller");
      await db.$transaction(async (tx) => {
        const r = await tx.bulkOrder.updateMany({
          where: { id, status: "ACCEPTED" },
          data: { status: "CANCELLED", rejectReason: a.reason, cancelledAt: new Date(), cancelledBy: "SELLER" },
        });
        if (r.count !== 1) throw conflict("This order was just updated. Refresh to see its status.");
        for (const it of o.items) await tx.shopInventory.update({ where: { id: it.inventoryId }, data: { stock: { increment: it.quantity } } });
      });
      await refundBulk(id, "Cancelled by seller");
      await notifyShop(o.buyerShopId, { type: "BULK_ORDER", title: "Bulk order cancelled", body: `${o.number}: ${a.reason}`, link });
      break;
  }
  await audit(actorOf(user), `bulk.${a.action}`, "BulkOrder", id, { after: a });
  return { ok: true };
}

export async function buyerBulkAction(user: SessionUser, id: string, a: { action: "cancel"; reason?: string | null } | { action: "received" }) {
  const o = await buyerOrder(user, id);
  if (a.action === "cancel") {
    await move(id, ["PAYMENT_PENDING", "PLACED"], { status: "CANCELLED", rejectReason: a.reason || null, cancelledAt: new Date(), cancelledBy: "BUYER" });
    await refundBulk(id, "Cancelled by buyer");
    if (o.status === "PLACED")
      await notifyShop(o.sellerShopId, {
        type: "BULK_ORDER",
        title: "Bulk order cancelled",
        body: `${o.number} was cancelled by the buyer.`,
        link: `/shop/bulk/orders/${o.id}`,
      });
  } else {
    await complete(id, ["DISPATCHED", "READY_FOR_PICKUP"]);
  }
  await audit(actorOf(user), `bulk.buyer_${a.action}`, "BulkOrder", id);
  return { ok: true };
}

/** Handed over: record the commission and the seller's earning (feeds their payouts) and the dealer's share. */
async function complete(id: string, from: BulkOrderStatus[]) {
  const settings = await getSettings();
  const o = await db.bulkOrder.findUniqueOrThrow({ where: { id }, include: { sellerShop: { include: { dealer: true } } } });
  const rateBps = settings.commission.b2bBps;
  const amount = applyBps(o.subtotal, rateBps);
  const dealer = o.sellerShop.dealer;
  const online = o.paymentMethod === "ONLINE";
  await db.$transaction(async (tx) => {
    const r = await tx.bulkOrder.updateMany({
      where: { id, status: { in: from } },
      data: { status: "DELIVERED", deliveredAt: new Date(), ...(online ? {} : { paymentStatus: "CAPTURED", paidAt: new Date() }) },
    });
    if (r.count !== 1) throw conflict("This order was just updated. Refresh to see its status.");
    await tx.commission.create({
      data: {
        bulkOrderId: id,
        shopId: o.sellerShopId,
        baseAmount: o.subtotal,
        rateBps,
        amount,
        // Online: the platform holds the money. On delivery: the seller holds it and owes the commission.
        shopEarning: online ? o.subtotal - amount + o.deliveryFee : -amount,
        dealerId: dealer?.id ?? null,
        dealerAmount: dealer ? applyBps(amount, dealer.commissionShareBps) : 0,
      },
    });
  });
  const link = `/shop/bulk/orders/${id}`;
  await notifyShop(o.sellerShopId, {
    type: "BULK_ORDER",
    title: "Bulk order completed",
    body: online
      ? `${o.number}: ${formatINR(o.subtotal - amount + o.deliveryFee)} added to your earnings.`
      : `${o.number}: ${formatINR(amount)} B2B commission charged to your balance.`,
    link,
  });
  await notifyShop(o.buyerShopId, { type: "BULK_ORDER", title: "Bulk order completed", body: `${o.number} has been handed over.`, link });
}

// ───────────────────────────── Housekeeping ─────────────────────────────

/** Cancel online bulk orders left unpaid (checks Cashfree first in case a webhook was missed). */
export async function expireUnpaidBulkOrders() {
  const settings = await getSettings();
  const cutoff = new Date(Date.now() - settings.order.paymentTimeoutMinutes * 60_000);
  const stale = await db.bulkOrder.findMany({ where: { status: "PAYMENT_PENDING", createdAt: { lt: cutoff } }, select: { id: true, gatewayOrderId: true } });
  let expired = 0;
  for (const o of stale) {
    try {
      if (o.gatewayOrderId && !isMock(o.gatewayOrderId) && isCashfreeLive() && (await syncBulkPayment(o.id)) === "paid") continue;
      const r = await db.bulkOrder.updateMany({
        where: { id: o.id, status: "PAYMENT_PENDING" },
        data: { status: "CANCELLED", rejectReason: "Payment not completed in time", cancelledAt: new Date(), cancelledBy: "SYSTEM" },
      });
      expired += r.count;
    } catch (e) {
      console.warn("[bulk] expire failed", o.id, e);
    }
  }
  return expired;
}

/** Bulk orders for a shop, as buyer or seller. */
export async function listBulkOrders(shopId: string, side: "buying" | "selling") {
  return db.bulkOrder.findMany({
    where:
      side === "buying"
        ? { buyerShopId: shopId }
        : // The seller never saw orders that weren't paid for.
          { sellerShopId: shopId, NOT: [{ status: "PAYMENT_PENDING" }, { status: "CANCELLED", paymentMethod: "ONLINE", paidAt: null }] },
    include: { buyerShop: { select: { name: true } }, sellerShop: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

/** Full order for the buyer, the seller or the admin. */
export async function bulkOrderFor(user: SessionUser, id: string) {
  const o = await db.bulkOrder.findUnique({
    where: { id },
    include: {
      items: true,
      buyerShop: { select: { id: true, name: true, contactPhone: true } },
      sellerShop: { select: { id: true, name: true, contactPhone: true, address: true } },
      commission: true,
    },
  });
  if (!o) throw notFound("Bulk order");
  if (user.role === "SUPER_ADMIN") return { order: o, side: "admin" as const };
  if (user.role !== "SHOP_OWNER") throw forbidden();
  const { shops } = await activeShopFor(user);
  if (shops.some((s) => s.id === o.sellerShopId)) return { order: o, side: "seller" as const };
  if (shops.some((s) => s.id === o.buyerShopId)) return { order: o, side: "buyer" as const };
  throw notFound("Bulk order");
}
