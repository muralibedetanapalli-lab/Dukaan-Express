import "server-only";
import { randomBytes } from "node:crypto";
import { db, type Tx } from "@/server/db";
import { AppError, badRequest, conflict, forbidden, notFound } from "@/server/errors";
import { STATUS_META, type OrderStatusKey } from "@/lib/order-status";
import { applyBps, formatINR } from "@/lib/money";
import type { Prisma, PaymentMethod } from "@/generated/prisma/client";
import { canTransition, STOCK_RESERVED_STATUSES, type ActorRole } from "./order-state";
import { computeQuote } from "./pricing";
import { pricingConfig } from "./cart";
import { checkCoupon } from "./coupon";
import { eligibleShops } from "./location";
import { getSettings } from "./settings";
import { audit } from "./audit";
import { notifyAdmins, notifyCustomer, notifyShop, signalUsers, shopOwnerUserIds, customerUserId, adminUserIds } from "./notification";
import { initiateRefund } from "./payment";
import { isCashfreeLive } from "@/server/integrations/cashfree";

export interface OrderActor {
  id: string | null;
  role: ActorRole;
  customerId?: string | null;
  shopOwnerId?: string | null;
}

export const SYSTEM: OrderActor = { id: null, role: "SYSTEM" };

function newOrderNumber() {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `DX${ymd}${randomBytes(3).toString("hex").toUpperCase()}`;
}

// ───────────────────────────── Placement ─────────────────────────────

export interface PlaceOrderInput {
  addressId: string;
  paymentMethod: PaymentMethod;
  notes?: string | null;
}

export async function placeOrder(customer: { userId: string; customerId: string }, input: PlaceOrderInput) {
  const settings = await getSettings();
  const address = await db.customerAddress.findFirst({
    where: { id: input.addressId, customerId: customer.customerId, deletedAt: null },
  });
  if (!address) throw badRequest("Please choose a valid delivery address");

  const cart = await db.cart.findUnique({
    where: { customerId: customer.customerId },
    include: {
      items: {
        include: {
          inventory: { include: { product: { include: { category: true, images: { take: 1, orderBy: { sortOrder: "asc" } } } }, variant: true } },
        },
      },
    },
  });
  if (!cart || !cart.items.length) throw badRequest("Your cart is empty");
  const shopIds = new Set(cart.items.map((i) => i.shopId));
  if (shopIds.size > 1) throw badRequest("Orders can contain items from one shop only");
  const shopId = cart.items[0].shopId;

  const shop = await db.shop.findUnique({ where: { id: shopId } });
  if (!shop) throw notFound("Shop");
  const reach = (await eligibleShops({ lat: address.latitude, lng: address.longitude })).find((s) => s.id === shopId);
  if (!reach) throw unprocessableOrder("SHOP_NOT_SERVICEABLE", `${shop.name} does not deliver to this address`);
  if (!reach.orderable) throw unprocessableOrder("SHOP_CLOSED", `${shop.name} is not accepting orders right now`);

  // Payment method checks
  const isCod = input.paymentMethod === "COD";
  if (isCod && !settings.payments.codEnabled) throw badRequest("Cash on delivery is not available");
  if (!isCod) {
    if (!settings.payments.onlineEnabled) throw badRequest("Online payments are currently unavailable");
    const map = { UPI: settings.payments.upi, CARD: settings.payments.card, NETBANKING: settings.payments.netbanking };
    if (!map[input.paymentMethod as keyof typeof map]) throw badRequest("This payment method is not available");
  }
  if (cart.items.reduce((s, i) => s + i.quantity, 0) > settings.order.maxItemsPerOrder)
    throw badRequest(`You can order at most ${settings.order.maxItemsPerOrder} items at once`);

  // Validate every line against live inventory (never trust client prices / quantities).
  for (const it of cart.items) {
    const inv = it.inventory;
    const p = inv.product;
    if (inv.deletedAt || !inv.isAvailable || !p.isActive || p.deletedAt || p.approvalStatus !== "APPROVED")
      throw unprocessableOrder("ITEM_UNAVAILABLE", `${p.name} is no longer available`);
    if (it.quantity > inv.maxPerOrder) throw unprocessableOrder("QTY_LIMIT", `You can order at most ${inv.maxPerOrder} of ${p.name}`);
  }

  const lines = cart.items.map((it) => ({
    mrp: it.inventory.mrp,
    price: it.inventory.sellingPrice,
    quantity: it.quantity,
    taxRateBps: it.inventory.product.category.taxRateBps ?? settings.tax.defaultRateBps,
  }));
  const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);
  let coupon: { couponId: string; rule: Parameters<typeof computeQuote>[2]["coupon"] } | null = null;
  if (cart.couponCode) {
    const c = await checkCoupon(cart.couponCode, { customerId: customer.customerId, shopId, subtotal });
    if (!c.ok) throw unprocessableOrder("COUPON_INVALID", c.error);
    coupon = { couponId: c.couponId, rule: c.rule };
  }
  const quote = computeQuote(lines, pricingConfig(settings, shop.commissionBps), {
    distanceKm: reach.distanceKm,
    coupon: coupon?.rule ?? null,
  });
  if (!quote.meetsMinimum) throw unprocessableOrder("MIN_ORDER", `Minimum order value is ${formatINR(quote.minOrderAmount)}`);
  if (isCod && quote.total > settings.payments.codMaxAmount)
    throw unprocessableOrder("COD_LIMIT", `Cash on delivery is available for orders up to ${formatINR(settings.payments.codMaxAmount)}`);

  const initialStatus: OrderStatusKey = isCod ? "SHOP_PENDING" : "PAYMENT_PENDING";

  const order = await db.$transaction(async (tx) => {
    // Atomic, conditional stock reservation — prevents overselling under concurrency.
    for (const it of cart.items) {
      const r = await tx.shopInventory.updateMany({
        where: { id: it.inventoryId, stock: { gte: it.quantity }, isAvailable: true, deletedAt: null },
        data: { stock: { decrement: it.quantity } },
      });
      if (r.count !== 1) {
        throw unprocessableOrder("OUT_OF_STOCK", `${it.inventory.product.name} just went out of stock. Please update your cart.`);
      }
    }
    if (coupon) {
      const c = await tx.coupon.findUniqueOrThrow({ where: { id: coupon.couponId } });
      const r = await tx.coupon.updateMany({
        where: { id: c.id, ...(c.usageLimit != null ? { usedCount: { lt: c.usageLimit } } : {}) },
        data: { usedCount: { increment: 1 } },
      });
      if (r.count !== 1) throw unprocessableOrder("COUPON_EXHAUSTED", "This coupon has been fully redeemed");
    }

    const created = await tx.order.create({
      data: {
        orderNumber: newOrderNumber(),
        checkoutGroupId: `CG${randomBytes(6).toString("hex")}`,
        customerId: customer.customerId,
        shopId,
        status: initialStatus,
        paymentMethod: input.paymentMethod,
        paymentStatus: "PENDING",
        addressSnapshot: {
          label: address.label,
          name: address.name,
          phone: address.phone,
          line1: address.line1,
          line2: address.line2,
          landmark: address.landmark,
          city: address.city,
          state: address.state,
          pincode: address.pincode,
        },
        deliveryLat: address.latitude,
        deliveryLng: address.longitude,
        deliveryPincode: address.pincode,
        contactName: address.name,
        contactPhone: address.phone,
        itemsMrpTotal: quote.itemsMrpTotal,
        subtotal: quote.subtotal,
        itemDiscount: quote.itemDiscount,
        couponDiscount: quote.couponDiscount,
        deliveryFee: quote.deliveryFee,
        taxAmount: quote.taxAmount,
        taxInclusive: quote.taxInclusive,
        total: quote.total,
        couponId: coupon?.couponId ?? null,
        couponCode: quote.couponCode,
        commissionBps: quote.commissionBps,
        commissionAmount: quote.commissionAmount,
        shopEarning: quote.shopEarning,
        distanceKm: reach.distanceKm,
        etaMinutes: reach.etaMinutes,
        notes: input.notes ?? null,
        items: {
          create: cart.items.map((it, idx) => ({
            inventoryId: it.inventoryId,
            productId: it.inventory.productId,
            variantId: it.inventory.variantId,
            productName: it.inventory.product.name,
            variantName: it.inventory.variant?.name ?? null,
            imageUrl: it.inventory.product.images[0]?.url ?? null,
            unitLabel: it.inventory.variant?.name ?? `${it.inventory.product.unitValue ?? ""} ${it.inventory.product.unit}`.trim(),
            quantity: it.quantity,
            mrp: it.inventory.mrp,
            unitPrice: it.inventory.sellingPrice,
            lineTotal: it.inventory.sellingPrice * it.quantity,
            taxRateBps: lines[idx].taxRateBps,
            taxAmount: quote.lineTaxes[idx],
          })),
        },
        payments: {
          create: {
            provider: isCod ? "COD" : isCashfreeLive() ? "CASHFREE" : "CASHFREE_MOCK",
            method: input.paymentMethod,
            status: "PENDING",
            amount: quote.total,
          },
        },
        statusHistory: {
          create: [
            { fromStatus: null, toStatus: "CREATED", changedById: customer.userId, changedByRole: "CUSTOMER", remarks: "Order placed" },
            {
              fromStatus: "CREATED",
              toStatus: initialStatus,
              changedByRole: "SYSTEM",
              remarks: isCod ? "Cash on delivery — sent to shop" : "Awaiting online payment",
            },
          ],
        },
      },
    });
    if (coupon) {
      await tx.couponRedemption.create({
        data: { couponId: coupon.couponId, customerId: customer.customerId, orderId: created.id, amount: quote.couponDiscount },
      });
    }
    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    await tx.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
    return created;
  });

  await audit({ id: customer.userId, role: "CUSTOMER" }, "order.place", "Order", order.id, {
    after: { total: order.total, paymentMethod: order.paymentMethod },
  });
  void checkLowStock(order.id);

  // Online orders get their Cashfree order when the customer opens checkout (POST /orders/{id}/pay).
  if (isCod) await announceNewOrder(order.id);
  return db.order.findUniqueOrThrow({ where: { id: order.id }, include: { payments: true } });
}

function unprocessableOrder(code: string, message: string) {
  return new AppError(422, code, message);
}

export async function announceNewOrder(orderId: string) {
  const o = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
  const count = o.items.reduce((s, i) => s + i.quantity, 0);
  await notifyShop(o.shopId, {
    type: "ORDER_NEW",
    title: `New order ${o.orderNumber}`,
    body: `${count} item${count > 1 ? "s" : ""} · ${formatINR(o.total)} · ${o.paymentMethod === "COD" ? "Cash on delivery" : "Paid online"}`,
    link: `/shop/orders/${o.id}`,
    data: { orderId: o.id },
  });
  await notifyCustomer(o.customerId, {
    type: "ORDER_STATUS",
    title: "Order placed",
    body: `Your order ${o.orderNumber} has been sent to the shop.`,
    link: `/orders/${o.id}`,
    data: { orderId: o.id },
  });
}

async function checkLowStock(orderId: string) {
  try {
    const items = await db.orderItem.findMany({ where: { orderId }, include: { inventory: { include: { product: true } } } });
    const low = items.filter((i) => i.inventory.stock <= i.inventory.lowStockThreshold);
    if (!low.length) return;
    const shopId = items[0].inventory.shopId;
    await notifyShop(shopId, {
      type: "LOW_STOCK",
      title: "Low stock alert",
      body: low.map((i) => `${i.inventory.product.name} (${i.inventory.stock} left)`).join(", "),
      link: `/shop/inventory?filter=low`,
    });
  } catch (e) {
    console.warn("[order] low-stock check failed", e);
  }
}

// ───────────────────────────── Transitions ─────────────────────────────

export interface TransitionOptions {
  remarks?: string | null;
  data?: Prisma.OrderUpdateManyMutationInput;
  tx?: Tx;
  /** skip post-commit notifications (caller sends its own) */
  silent?: boolean;
}

async function assertAccess(order: { shopId: string; customerId: string }, actor: OrderActor) {
  if (actor.role === "CUSTOMER" && actor.customerId !== order.customerId) throw notFound("Order");
  if (actor.role === "SHOP_OWNER") {
    const shop = await db.shop.findUnique({ where: { id: order.shopId }, select: { ownerId: true } });
    if (!shop || shop.ownerId !== actor.shopOwnerId) throw notFound("Order");
  }
}

/**
 * Validated state transition. Uses optimistic concurrency (WHERE status = from) so two
 * simultaneous actions can never both succeed, and records OrderStatusHistory atomically.
 */
export async function transitionOrder(orderId: string, to: OrderStatusKey, actor: OrderActor, opts: TransitionOptions = {}) {
  const run = async (tx: Tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) throw notFound("Order");
    await assertAccess(order, actor);
    const from = order.status as OrderStatusKey;
    if (from === to) throw conflict(`Order is already ${STATUS_META[to].label.toLowerCase()}`);
    if (!canTransition(from, to, actor.role)) {
      throw new AppError(
        409,
        "INVALID_TRANSITION",
        `Cannot move order from "${STATUS_META[from].label}" to "${STATUS_META[to].label}"`,
      );
    }
    const now = new Date();
    const stamps: Prisma.OrderUpdateManyMutationInput = {};
    if (to === "SHOP_ACCEPTED") stamps.acceptedAt = now;
    if (to === "PACKED" && !order.packedAt) stamps.packedAt = now;
    if (to === "DELIVERED") stamps.deliveredAt = now;
    if (to === "CANCELLED" || to === "SHOP_REJECTED") stamps.cancelledAt = now;

    const res = await tx.order.updateMany({
      where: { id: orderId, status: from },
      data: { status: to, ...stamps, ...(opts.data ?? {}) },
    });
    if (res.count !== 1) throw conflict("This order was just updated by someone else. Please refresh.");

    await tx.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: from,
        toStatus: to,
        changedById: actor.id,
        changedByRole: actor.role,
        remarks: opts.remarks ?? null,
      },
    });

    // Release reserved stock when an order dies before dispatch.
    if ((to === "CANCELLED" || to === "SHOP_REJECTED") && STOCK_RESERVED_STATUSES.includes(from)) {
      for (const it of order.items) {
        await tx.shopInventory.update({ where: { id: it.inventoryId }, data: { stock: { increment: it.quantity } } });
      }
      if (order.couponId) {
        await tx.couponRedemption.deleteMany({ where: { orderId } });
        await tx.coupon.update({ where: { id: order.couponId }, data: { usedCount: { decrement: 1 } } });
      }
    }

    if (to === "DELIVERED") {
      if (order.paymentMethod === "COD") {
        await tx.payment.updateMany({ where: { orderId, provider: "COD" }, data: { status: "CAPTURED", capturedAt: now } });
        await tx.order.update({ where: { id: orderId }, data: { paymentStatus: "CAPTURED" } });
      }
      // The shop's regional dealer (if any) earns a share of the platform commission, fixed at delivery.
      const dealer = (await tx.shop.findUnique({ where: { id: order.shopId }, select: { dealer: { select: { id: true, commissionShareBps: true } } } }))?.dealer;
      await tx.commission.upsert({
        where: { orderId },
        create: {
          orderId,
          shopId: order.shopId,
          baseAmount: order.subtotal - order.couponDiscount,
          rateBps: order.commissionBps,
          amount: order.commissionAmount,
          shopEarning: order.shopEarning,
          dealerId: dealer?.id ?? null,
          dealerAmount: dealer ? applyBps(order.commissionAmount, dealer.commissionShareBps) : 0,
        },
        update: {},
      });
    }
    if (to === "DELIVERY_FAILED") {
      await tx.shipment.updateMany({ where: { orderId }, data: { failedDeliveryCount: { increment: 1 } } });
    }
    return { order, from };
  };

  const { order, from } = opts.tx ? await run(opts.tx) : await db.$transaction(run);
  if (!opts.tx) await afterTransition(orderId, from, to, actor, opts);
  return { orderId: order.id, from, to };
}

/** Post-commit side effects: notifications, realtime signals, refunds. */
export async function afterTransition(
  orderId: string,
  from: OrderStatusKey,
  to: OrderStatusKey,
  actor: OrderActor,
  opts: { remarks?: string | null; silent?: boolean } = {},
) {
  const o = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { shop: { select: { name: true } } } });
  const [shopUsers, custUser, admins] = await Promise.all([shopOwnerUserIds(o.shopId), customerUserId(o.customerId), adminUserIds()]);
  signalUsers([...shopUsers, ...(custUser ? [custUser] : []), ...admins], "order.updated", { orderId, status: to });
  await audit({ id: actor.id, role: actor.role }, `order.${to.toLowerCase()}`, "Order", orderId, {
    before: { status: from },
    after: { status: to, remarks: opts.remarks ?? undefined },
  });

  if (!opts.silent) {
    const custMsg: Partial<Record<OrderStatusKey, string>> = {
      SHOP_ACCEPTED: `${o.shop.name} accepted your order and will start preparing it shortly.`,
      PREPARING: `${o.shop.name} is preparing your order.`,
      PACKED: "Your order is packed and a delivery partner is being arranged.",
      SHIPMENT_CREATED: "Shipment created — waiting for the delivery partner to pick up.",
      COURIER_ASSIGNED: "A delivery partner has been assigned to your order.",
      PICKED_UP: "Your order has been picked up.",
      OUT_FOR_DELIVERY: "Your order is out for delivery!",
      DELIVERED: "Your order has been delivered. Enjoy!",
      DELIVERY_FAILED: "Delivery attempt failed. Our team will contact you.",
      SHOP_REJECTED: `${o.shop.name} could not accept your order${opts.remarks ? `: ${opts.remarks}` : "."}`,
      CANCELLED: `Your order ${o.orderNumber} was cancelled.`,
      REFUNDED: `Your refund for order ${o.orderNumber} has been processed.`,
    };
    if (custMsg[to]) {
      await notifyCustomer(o.customerId, {
        type: to === "REFUNDED" ? "REFUND" : "ORDER_STATUS",
        title: `Order ${STATUS_META[to].label.toLowerCase()}`,
        body: custMsg[to]!,
        link: `/orders/${orderId}`,
        data: { orderId },
      });
    }
    if (to === "CANCELLED" && actor.role !== "SHOP_OWNER") {
      await notifyShop(o.shopId, {
        type: "ORDER_CANCELLED",
        title: `Order ${o.orderNumber} cancelled`,
        body: opts.remarks ? `Reason: ${opts.remarks}` : "The order was cancelled. Do not pack it.",
        link: `/shop/orders/${orderId}`,
        data: { orderId },
      });
    }
    if (to === "DELIVERY_FAILED") {
      await notifyShop(o.shopId, { type: "DELIVERY_ISSUE", title: `Delivery failed · ${o.orderNumber}`, body: "The courier could not deliver this order.", link: `/shop/orders/${orderId}` });
      await notifyAdmins({ type: "DELIVERY_ISSUE", title: `Delivery failed · ${o.orderNumber}`, body: `${o.shop.name} → ${o.contactName}`, link: `/admin/orders/${orderId}` });
    }
    if (to === "COURIER_ASSIGNED" || to === "PICKED_UP") {
      await notifyShop(o.shopId, {
        type: "PICKUP",
        title: to === "PICKED_UP" ? `Picked up · ${o.orderNumber}` : `Rider assigned · ${o.orderNumber}`,
        body: to === "PICKED_UP" ? "The delivery partner has collected the order." : "Keep the package ready for pickup.",
        link: `/shop/orders/${orderId}`,
      });
    }
  }

  // Automatic refunds for prepaid orders that will not be fulfilled.
  if ((to === "CANCELLED" || to === "SHOP_REJECTED") && o.paymentStatus === "CAPTURED") {
    const settings = await getSettings();
    const auto = to === "CANCELLED" ? settings.refund.autoRefundOnCancel : settings.refund.autoRefundOnReject;
    if (auto) {
      try {
        await initiateRefund(orderId, { amount: o.total, reason: to === "CANCELLED" ? "Order cancelled" : "Rejected by shop", actor: SYSTEM });
      } catch (e) {
        console.error("[order] auto refund failed", e);
        await notifyAdmins({ type: "REFUND", title: `Refund failed · ${o.orderNumber}`, body: String((e as Error).message), link: `/admin/orders/${orderId}` });
      }
    }
  }
}

// ───────────────────────────── Customer actions ─────────────────────────────

export async function cancelByCustomer(orderId: string, actor: OrderActor, reason: string) {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order || order.customerId !== actor.customerId) throw notFound("Order");
  const settings = await getSettings();
  if (!settings.cancellation.customerCancellableStatuses.includes(order.status)) {
    throw new AppError(409, "NOT_CANCELLABLE", "This order can no longer be cancelled. Please contact support.");
  }
  return transitionOrder(orderId, "CANCELLED", actor, {
    remarks: reason,
    data: { cancelReason: reason, cancelledBy: "CUSTOMER" },
  });
}

// ───────────────────────────── Shop actions ─────────────────────────────

export async function shopReject(orderId: string, actor: OrderActor, reason: string) {
  return transitionOrder(orderId, "SHOP_REJECTED", actor, { remarks: reason, data: { rejectionReason: reason } });
}

export async function adminCancel(orderId: string, actor: OrderActor, reason: string) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { shipment: true } });
  if (!order) throw notFound("Order");
  if (order.shipment && order.shipment.shiprocketOrderId && !["CANCELLED", "EXCEPTION"].includes(order.shipment.status)) {
    const { cancelShipment } = await import("./shipment");
    await cancelShipment(orderId, actor, { keepOrderStatus: true });
  }
  return transitionOrder(orderId, "CANCELLED", actor, { remarks: reason, data: { cancelReason: reason, cancelledBy: "ADMIN" } });
}

// ───────────────────────────── Authorized modification workflow ─────────────────────────────

const MODIFIABLE: OrderStatusKey[] = ["SHOP_ACCEPTED", "PREPARING", "READY_FOR_PACKING"];

/** Shop owners can only *request* reductions (e.g. item out of stock); an admin must approve. */
export async function requestModification(
  orderId: string,
  actor: OrderActor,
  input: { reason: string; changes: { orderItemId: string; newQuantity: number }[] },
) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true, modifications: true } });
  if (!order) throw notFound("Order");
  await assertAccess(order, actor);
  if (!MODIFIABLE.includes(order.status as OrderStatusKey)) throw conflict("Modifications are only possible before packing");
  if (order.modifications.some((m) => m.status === "PENDING")) throw conflict("A modification request is already pending");
  for (const c of input.changes) {
    const item = order.items.find((i) => i.id === c.orderItemId);
    if (!item) throw badRequest("Unknown order item");
    if (c.newQuantity < 0 || c.newQuantity >= item.quantity) throw badRequest("Quantities can only be reduced");
  }
  if (order.items.every((i) => input.changes.find((c) => c.orderItemId === i.id)?.newQuantity === 0)) {
    throw badRequest("To remove every item, reject the order instead");
  }
  const mod = await db.orderModification.create({
    data: { orderId, requestedById: actor.id!, reason: input.reason, changes: input.changes },
  });
  await notifyAdmins({
    type: "MODIFICATION",
    title: `Modification requested · ${order.orderNumber}`,
    body: input.reason,
    link: `/admin/orders/${orderId}`,
  });
  return mod;
}

export async function reviewModification(modId: string, actor: OrderActor, approve: boolean, note?: string | null) {
  if (actor.role !== "SUPER_ADMIN") throw forbidden();
  const mod = await db.orderModification.findUnique({ where: { id: modId } });
  if (!mod || mod.status !== "PENDING") throw notFound("Pending modification");
  if (!approve) {
    await db.orderModification.update({
      where: { id: modId },
      data: { status: "REJECTED", reviewedById: actor.id, reviewNote: note ?? null, reviewedAt: new Date() },
    });
    await notifyShop((await db.order.findUniqueOrThrow({ where: { id: mod.orderId } })).shopId, {
      type: "MODIFICATION",
      title: "Modification rejected",
      body: note ?? "Please fulfil the order as placed.",
      link: `/shop/orders/${mod.orderId}`,
    });
    return { approved: false };
  }

  const changes = mod.changes as { orderItemId: string; newQuantity: number }[];
  const settings = await getSettings();
  const result = await db.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: mod.orderId }, include: { items: true } });
    if (!MODIFIABLE.includes(order.status as OrderStatusKey)) throw conflict("Order has progressed past the modifiable stage");
    for (const c of changes) {
      const item = order.items.find((i) => i.id === c.orderItemId)!;
      const diff = item.quantity - c.newQuantity;
      await tx.shopInventory.update({ where: { id: item.inventoryId }, data: { stock: { increment: diff } } });
      if (c.newQuantity === 0) await tx.orderItem.delete({ where: { id: item.id } });
      else await tx.orderItem.update({ where: { id: item.id }, data: { quantity: c.newQuantity, lineTotal: item.unitPrice * c.newQuantity } });
    }
    const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
    const shop = await tx.shop.findUniqueOrThrow({ where: { id: order.shopId } });
    const cfg = pricingConfig(settings, null);
    cfg.commissionBps = order.commissionBps;
    cfg.order = { minOrderAmount: 0 };
    // Keep the original coupon discount (capped to the new subtotal) and original delivery fee.
    const quote = computeQuote(
      items.map((i) => ({ mrp: i.mrp, price: i.unitPrice, quantity: i.quantity, taxRateBps: i.taxRateBps })),
      { ...cfg, delivery: { baseFee: order.deliveryFee, perKmFee: 0, freeDeliveryThreshold: Number.MAX_SAFE_INTEGER } },
      { distanceKm: 0, coupon: order.couponDiscount ? { code: order.couponCode ?? "COUPON", type: "FLAT", value: order.couponDiscount, maxDiscount: null, minOrderAmount: 0 } : null },
    );
    void shop;
    const refundDue = order.total - quote.total;
    await tx.order.update({
      where: { id: order.id },
      data: {
        itemsMrpTotal: quote.itemsMrpTotal,
        subtotal: quote.subtotal,
        itemDiscount: quote.itemDiscount,
        couponDiscount: quote.couponDiscount,
        taxAmount: quote.taxAmount,
        total: quote.total,
        commissionAmount: quote.commissionAmount,
        shopEarning: quote.shopEarning,
      },
    });
    for (const [idx, it] of items.entries()) {
      await tx.orderItem.update({ where: { id: it.id }, data: { taxAmount: quote.lineTaxes[idx] } });
    }
    if (order.paymentMethod === "COD") {
      await tx.payment.updateMany({ where: { orderId: order.id, provider: "COD" }, data: { amount: quote.total } });
    }
    await tx.orderModification.update({
      where: { id: modId },
      data: { status: "APPROVED", reviewedById: actor.id, reviewNote: note ?? null, reviewedAt: new Date() },
    });
    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: order.status,
        changedById: actor.id,
        changedByRole: actor.role,
        remarks: `Order modified (approved): ${mod.reason}. New total ${formatINR(quote.total)}`,
      },
    });
    return { order, refundDue };
  });

  if (result.order.paymentStatus === "CAPTURED" && result.refundDue > 0) {
    await initiateRefund(result.order.id, { amount: result.refundDue, reason: `Order modification: ${mod.reason}`, actor, partial: true });
  }
  await notifyCustomer(result.order.customerId, {
    type: "ORDER_STATUS",
    title: "Your order was updated",
    body: `${mod.reason}. ${result.refundDue > 0 ? `${formatINR(result.refundDue)} will be refunded.` : ""}`.trim(),
    link: `/orders/${result.order.id}`,
  });
  await notifyShop(result.order.shopId, { type: "MODIFICATION", title: "Modification approved", body: "Pack the updated quantities.", link: `/shop/orders/${result.order.id}` });
  await audit({ id: actor.id, role: actor.role }, "order.modification.approve", "Order", result.order.id, { after: { modId, refundDue: result.refundDue } });
  return { approved: true, refundDue: result.refundDue };
}

// ───────────────────────────── Queries ─────────────────────────────

export const orderDetailInclude = {
  items: true,
  payments: { orderBy: { createdAt: "desc" } },
  refunds: { orderBy: { createdAt: "desc" } },
  statusHistory: { orderBy: { createdAt: "asc" } },
  shipment: { include: { events: { orderBy: { occurredAt: "desc" } }, deliveryPartner: true } },
  shop: { include: { address: true } },
  customer: { include: { user: { select: { name: true, phone: true, email: true } } } },
  modifications: { orderBy: { createdAt: "desc" } },
  review: true,
} satisfies Prisma.OrderInclude;

export async function getOrderForActor(orderId: string, actor: OrderActor) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: orderDetailInclude });
  if (!order) throw notFound("Order");
  await assertAccess(order, actor);
  return order;
}

/** Reorder: put still-available items from a past order back in the cart (current prices apply). */
export async function reorder(orderId: string, actor: OrderActor) {
  const order = await getOrderForActor(orderId, actor);
  const { addToCart } = await import("./cart");
  const skipped: string[] = [];
  let added = 0;
  let first = true;
  for (const it of order.items) {
    try {
      await addToCart(actor.customerId!, it.inventoryId, it.quantity, first);
      first = false;
      added++;
    } catch {
      skipped.push(it.productName);
    }
  }
  return { added, skipped };
}

export { eligibleShops };
