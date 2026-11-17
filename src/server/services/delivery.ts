import "server-only";
import { randomInt } from "node:crypto";
import { db } from "@/server/db";
import { badRequest, conflict, forbidden, notFound } from "@/server/errors";
import type { SessionUser } from "@/server/auth/session";
import { haversineKm } from "@/lib/geo";
import { formatINR } from "@/lib/money";
import type { OrderStatusKey } from "@/lib/order-status";
import { audit } from "./audit";
import { afterTransition, transitionOrder, SYSTEM, type OrderActor } from "./order";
import { deliveryFeeFor } from "./pricing";
import { getSettings } from "./settings";
import { adminUserIds, customerUserId, notifyAdmins, notifyCustomer, notifyShop, notifyUsers, shopOwnerUserIds, signalUsers } from "./notification";

/**
 * Deliveries: the shop's own staff (OWN) or a Dukaan Express rider (RIDER), per the shop's delivery mode.
 *
 *  RIDER: when the shop marks the order packed, a delivery is opened ("finding a rider") and offered to online
 *         riders near the shop. The first rider to accept gets it (atomic claim), picks it up at the shop,
 *         shares live location while delivering, and completes it with the customer's 4-digit handover code.
 *         The rider earns the delivery fee (distance based, paid even when the customer got free delivery);
 *         cash collected on COD orders is deducted from the rider's wallet.
 *  OWN:   the shop dispatches and completes the delivery itself (same handover code) and keeps the delivery fee.
 */

const ACTIVE_RIDER_STATUSES = ["COURIER_ASSIGNED", "OUT_FOR_DELIVERY"] as const;
const LOCATION_FRESH_MS = 10 * 60_000;

export const newDeliveryCode = () => String(randomInt(0, 10_000)).padStart(4, "0");

async function loadOrder(orderId: string) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { shop: { include: { address: true } }, shipment: true },
  });
  if (!order) throw notFound("Order");
  return order;
}

const riderActor = (user: SessionUser): OrderActor => ({ id: user.id, role: "RIDER" });

export function requireRider(user: SessionUser) {
  if (user.role !== "RIDER" || !user.riderId) throw forbidden();
  return user.riderId;
}

async function notifyDeliveryParties(orderId: string) {
  const o = await db.order.findUnique({ where: { id: orderId }, select: { shopId: true, customerId: true, shipment: { select: { rider: { select: { userId: true } } } } } });
  if (!o) return;
  const ids = [...(await shopOwnerUserIds(o.shopId)), ...(await adminUserIds())];
  const cust = await customerUserId(o.customerId);
  if (cust) ids.push(cust);
  if (o.shipment?.rider) ids.push(o.shipment.rider.userId);
  signalUsers(ids, "order.updated", { orderId });
}

// ───────────────────────────── Dispatch ─────────────────────────────

/** Called when the shop marks an order packed: opens the delivery in the shop's mode. */
export async function startDelivery(orderId: string, actor: OrderActor) {
  const order = await loadOrder(orderId);
  if (order.status !== "PACKED") throw conflict("A delivery can only be started for packed orders");
  const settings = await getSettings();
  const mode = order.shop.deliveryMode;
  const data = {
    mode,
    status: mode === "RIDER" ? ("CREATED" as const) : ("PENDING" as const),
    riderId: null,
    riderFee: mode === "RIDER" ? deliveryFeeFor(order.distanceKm, settings.delivery) : 0,
    codAmount: order.paymentMethod === "COD" ? order.total : 0,
    searchStartedAt: mode === "RIDER" ? new Date() : null,
    noRiderAlertedAt: null,
    assignedAt: null,
    pickedUpAt: null,
    lastError: null,
  };
  const shipment = await db.shipment.upsert({
    where: { orderId },
    create: { orderId, ...data, deliveryCode: newDeliveryCode() },
    update: data,
  });
  await addEvent(shipment.id, mode === "RIDER" ? "CREATED" : "PENDING", mode === "RIDER" ? "Looking for a rider" : "Shop will deliver with its own staff");
  if (mode === "RIDER") {
    await transitionOrder(orderId, "SHIPMENT_CREATED", SYSTEM, { remarks: "Looking for a rider", silent: true });
    await offerToRiders(shipment.id);
  }
  await audit({ id: actor.id, role: actor.role }, "delivery.start", "Shipment", shipment.id, { after: { mode, riderFee: shipment.riderFee } });
  return shipment;
}

/** Push a new-job alert to online riders whose last known location is near the shop. */
export async function offerToRiders(shipmentId: string) {
  const s = await db.shipment.findUnique({ where: { id: shipmentId }, include: { order: { include: { shop: { include: { address: true } } } } } });
  if (!s || s.status !== "CREATED" || !s.order.shop.address) return 0;
  const settings = await getSettings();
  const shopPoint = { lat: s.order.shop.address.latitude, lng: s.order.shop.address.longitude };
  const riders = await db.rider.findMany({
    where: { isOnline: true, kycStatus: "APPROVED", user: { status: "ACTIVE", deletedAt: null }, lat: { not: null }, locationAt: { gte: new Date(Date.now() - LOCATION_FRESH_MS) } },
    select: { id: true, userId: true, lat: true, lng: true, deliveries: { where: { status: { in: [...ACTIVE_RIDER_STATUSES] } }, select: { id: true } } },
  });
  const near = riders.filter((r) => !r.deliveries.length && haversineKm(shopPoint, { lat: r.lat!, lng: r.lng! }) <= settings.delivery.riderSearchRadiusKm);
  if (near.length) {
    await notifyUsers(
      near.map((r) => r.userId),
      {
        type: "DELIVERY_JOB",
        title: `New delivery · earn ${formatINR(s.riderFee)}`,
        body: `Pickup at ${s.order.shop.name}, ${s.order.distanceKm.toFixed(1)} km to the customer${s.codAmount ? ` · collect ${formatINR(s.codAmount)} cash` : ""}`,
        link: "/rider",
      },
    );
  }
  return near.length;
}

// ───────────────────────────── Rider: jobs ─────────────────────────────

/** Open jobs near the rider (or all open jobs if the rider hasn't shared a location yet). */
export async function availableJobs(riderId: string) {
  const rider = await db.rider.findUniqueOrThrow({ where: { id: riderId } });
  if (rider.kycStatus !== "APPROVED") return [];
  const settings = await getSettings();
  const jobs = await db.shipment.findMany({
    where: { status: "CREATED", riderId: null, mode: "RIDER" },
    orderBy: { searchStartedAt: "asc" },
    take: 50,
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          distanceKm: true,
          deliveryLat: true,
          deliveryLng: true,
          addressSnapshot: true,
          paymentMethod: true,
          _count: { select: { items: true } },
          shop: { select: { name: true, address: { select: { line1: true, city: true, latitude: true, longitude: true } } } },
        },
      },
    },
  });
  return jobs
    .map((j) => {
      const a = j.order.shop.address;
      const pickupKm = rider.lat != null && a ? haversineKm({ lat: rider.lat, lng: rider.lng! }, { lat: a.latitude, lng: a.longitude }) : null;
      return { ...j, pickupKm };
    })
    .filter((j) => j.pickupKm == null || j.pickupKm <= settings.delivery.riderSearchRadiusKm * 1.5)
    .sort((a, b) => (a.pickupKm ?? 99) - (b.pickupKm ?? 99));
}

export async function activeDelivery(riderId: string) {
  return db.shipment.findFirst({
    where: { riderId, status: { in: [...ACTIVE_RIDER_STATUSES] } },
    include: {
      order: {
        include: {
          items: { select: { productName: true, variantName: true, quantity: true } },
          shop: { select: { name: true, contactPhone: true, address: true } },
        },
      },
    },
  });
}

/** First rider to accept wins: the claim is a conditional update, so two riders can never both get a job. */
export async function acceptJob(user: SessionUser, shipmentId: string) {
  const riderId = requireRider(user);
  const rider = await db.rider.findUniqueOrThrow({ where: { id: riderId } });
  if (rider.kycStatus !== "APPROVED") throw badRequest("Your documents must be approved before you can deliver");
  if (!rider.isOnline) throw badRequest("Go online to accept deliveries");
  if (await db.shipment.findFirst({ where: { riderId, status: { in: [...ACTIVE_RIDER_STATUSES] } }, select: { id: true } })) {
    throw conflict("Finish your current delivery first");
  }
  const s = await db.$transaction(async (tx) => {
    const claimed = await tx.shipment.updateMany({
      where: { id: shipmentId, riderId: null, status: "CREATED", mode: "RIDER" },
      data: { riderId, status: "COURIER_ASSIGNED", assignedAt: new Date(), attempts: { increment: 1 } },
    });
    if (claimed.count !== 1) throw conflict("Another rider just took this delivery");
    const row = await tx.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
    await transitionOrder(row.orderId, "COURIER_ASSIGNED", riderActor(user), { tx, remarks: `Accepted by ${user.name ?? "rider"}` });
    return row;
  });
  await addEvent(s.id, "COURIER_ASSIGNED", `Accepted by ${user.name ?? "rider"}`);
  await afterTransition(s.orderId, "SHIPMENT_CREATED", "COURIER_ASSIGNED", riderActor(user));
  await notifyDeliveryParties(s.orderId);
  return s;
}

async function riderShipment(user: SessionUser, shipmentId: string) {
  const riderId = requireRider(user);
  const s = await db.shipment.findUnique({ where: { id: shipmentId }, include: { order: true } });
  if (!s || s.riderId !== riderId) throw notFound("Delivery");
  return s;
}

/** Rider gives the job back before pickup; it is offered to other riders again. */
export async function releaseJob(user: SessionUser, shipmentId: string, reason: string) {
  const s = await riderShipment(user, shipmentId);
  if (s.status !== "COURIER_ASSIGNED") throw conflict("You can only give back a delivery before picking it up");
  await db.$transaction(async (tx) => {
    const r = await tx.shipment.updateMany({ where: { id: s.id, riderId: s.riderId, status: "COURIER_ASSIGNED" }, data: { riderId: null, status: "CREATED", assignedAt: null } });
    if (r.count !== 1) throw conflict("This delivery was just updated. Please refresh.");
    await transitionOrder(s.orderId, "SHIPMENT_CREATED", riderActor(user), { tx, remarks: `Rider gave it back: ${reason}` });
  });
  await addEvent(s.id, "CREATED", `${user.name ?? "Rider"} gave it back: ${reason}`);
  await offerToRiders(s.id);
  await notifyDeliveryParties(s.orderId);
}

/** Rider collected the parcel at the shop. */
export async function pickUp(user: SessionUser, shipmentId: string) {
  const s = await riderShipment(user, shipmentId);
  if (s.status !== "COURIER_ASSIGNED") throw conflict("This delivery is not waiting for pickup");
  await db.$transaction(async (tx) => {
    await tx.shipment.update({ where: { id: s.id }, data: { status: "OUT_FOR_DELIVERY", pickedUpAt: new Date() } });
    await transitionOrder(s.orderId, "PICKED_UP", riderActor(user), { tx, remarks: "Picked up from the shop" });
    await transitionOrder(s.orderId, "OUT_FOR_DELIVERY", riderActor(user), { tx, remarks: "On the way to the customer" });
  });
  await addEvent(s.id, "OUT_FOR_DELIVERY", "Picked up — on the way to the customer");
  await afterTransition(s.orderId, "COURIER_ASSIGNED", "PICKED_UP", riderActor(user), { silent: true });
  await afterTransition(s.orderId, "PICKED_UP", "OUT_FOR_DELIVERY", riderActor(user));
  await notifyDeliveryParties(s.orderId);
}

// ───────────────────────────── Shop: own delivery ─────────────────────────────

async function shopOrder(user: SessionUser, orderId: string) {
  const order = await loadOrder(orderId);
  if (user.role === "SHOP_OWNER") {
    if (order.shop.ownerId !== user.shopOwnerId) throw notFound("Order");
  } else if (user.role !== "SUPER_ADMIN") throw forbidden();
  return order;
}

/**
 * Shop sends the order out with its own staff. Works for own-delivery shops once packed, and for rider shops
 * while still looking for a rider (e.g. no rider available) — the shop then keeps the delivery fee.
 */
export async function dispatchOwn(user: SessionUser, orderId: string) {
  const order = await shopOrder(user, orderId);
  const status = order.status as OrderStatusKey;
  if (status === "DELIVERY_FAILED" && order.shipment?.mode === "OWN") {
    await transitionOrder(orderId, "OUT_FOR_DELIVERY", { id: user.id, role: user.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "SHOP_OWNER", shopOwnerId: user.shopOwnerId }, { remarks: "Retrying delivery" });
    return;
  }
  if (status !== "PACKED" && status !== "SHIPMENT_CREATED") throw conflict("The order must be packed, and not yet with a rider");
  if (status === "SHIPMENT_CREATED") {
    const r = await db.shipment.updateMany({ where: { orderId, status: "CREATED", riderId: null }, data: { mode: "OWN", status: "OUT_FOR_DELIVERY", riderFee: 0, pickedUpAt: new Date() } });
    if (r.count !== 1) throw conflict("A rider just accepted this delivery");
  } else {
    await db.shipment.upsert({
      where: { orderId },
      create: { orderId, mode: "OWN", status: "OUT_FOR_DELIVERY", deliveryCode: newDeliveryCode(), codAmount: order.paymentMethod === "COD" ? order.total : 0, pickedUpAt: new Date() },
      update: { mode: "OWN", status: "OUT_FOR_DELIVERY", riderId: null, riderFee: 0, pickedUpAt: new Date() },
    });
  }
  const s = await db.shipment.findUniqueOrThrow({ where: { orderId } });
  await addEvent(s.id, "OUT_FOR_DELIVERY", "Out for delivery with the shop's own staff");
  await transitionOrder(orderId, "OUT_FOR_DELIVERY", { id: user.id, role: user.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "SHOP_OWNER", shopOwnerId: user.shopOwnerId }, { remarks: "Shop's own delivery" });
  await notifyDeliveryParties(orderId);
}

// ───────────────────────────── Completing ─────────────────────────────

/**
 * Delivered: needs the customer's 4-digit code. Rider deliveries credit the rider's wallet with the delivery fee
 * and, for cash-on-delivery orders, debit the cash the rider collected — all in the same transaction.
 */
export async function completeDelivery(user: SessionUser, orderId: string, code: string) {
  const order = await loadOrder(orderId);
  const s = order.shipment;
  if (!s) throw notFound("Delivery");
  const actor = deliveryActor(user, order, s);
  if (order.status !== "OUT_FOR_DELIVERY") throw conflict("This order is not out for delivery");
  if (!s.deliveryCode || code.trim() !== s.deliveryCode) throw badRequest("Wrong delivery code. Ask the customer for the 4-digit code shown in their app.");

  await db.$transaction(async (tx) => {
    await tx.shipment.update({ where: { id: s.id }, data: { status: "DELIVERED", deliveredAt: new Date() } });
    await transitionOrder(orderId, "DELIVERED", actor, { tx, remarks: s.mode === "RIDER" ? "Delivered by rider" : "Delivered by the shop" });
    if (s.mode === "RIDER" && s.riderId) {
      if (s.riderFee > 0) {
        await tx.riderWalletEntry.create({ data: { riderId: s.riderId, type: "DELIVERY_EARNING", amount: s.riderFee, orderId, note: `Delivery ${order.orderNumber}` } });
      }
      if (s.codAmount > 0) {
        await tx.riderWalletEntry.create({ data: { riderId: s.riderId, type: "COD_COLLECTED", amount: -s.codAmount, orderId, note: `Cash collected · ${order.orderNumber}` } });
      }
    }
  });
  await addEvent(s.id, "DELIVERED", "Delivered — handover code verified");
  await afterTransition(orderId, "OUT_FOR_DELIVERY", "DELIVERED", actor);
  if (s.mode === "RIDER" && s.riderId) {
    const rider = await db.rider.findUnique({ where: { id: s.riderId }, select: { userId: true } });
    if (rider) {
      await notifyUsers([rider.userId], {
        type: "WALLET",
        title: `Delivered · ${formatINR(s.riderFee)} added`,
        body: s.codAmount ? `Cash collected ${formatINR(s.codAmount)} was deducted from your wallet.` : `Earning for ${order.orderNumber} is in your wallet.`,
        link: "/rider/wallet",
      });
    }
  }
  await notifyDeliveryParties(orderId);
}

export async function failDelivery(user: SessionUser, orderId: string, reason: string) {
  const order = await loadOrder(orderId);
  const s = order.shipment;
  if (!s) throw notFound("Delivery");
  const actor = deliveryActor(user, order, s);
  if (order.status !== "OUT_FOR_DELIVERY") throw conflict("This order is not out for delivery");
  // (failedDeliveryCount is incremented by the DELIVERY_FAILED transition itself)
  await db.shipment.update({ where: { id: s.id }, data: { status: "FAILED_ATTEMPT", lastError: reason, lastErrorAt: new Date() } });
  await addEvent(s.id, "FAILED_ATTEMPT", reason);
  await transitionOrder(orderId, "DELIVERY_FAILED", actor, { remarks: reason });
  await notifyDeliveryParties(orderId);
}

function deliveryActor(user: SessionUser, order: { shop: { ownerId: string | null } }, s: { mode: string; riderId: string | null }): OrderActor {
  if (user.role === "SUPER_ADMIN") return { id: user.id, role: "SUPER_ADMIN" };
  if (user.role === "RIDER") {
    if (s.mode !== "RIDER" || s.riderId !== user.riderId) throw notFound("Delivery");
    return riderActor(user);
  }
  if (user.role === "SHOP_OWNER") {
    if (order.shop.ownerId !== user.shopOwnerId) throw notFound("Order");
    if (s.mode !== "OWN") throw forbidden("A Dukaan Express rider is delivering this order");
    return { id: user.id, role: "SHOP_OWNER", shopOwnerId: user.shopOwnerId };
  }
  throw forbidden();
}

// ───────────────────────────── Admin ─────────────────────────────

/** Admin hands a waiting delivery to a specific rider (e.g. nobody accepted it). */
export async function adminAssignRider(user: SessionUser, orderId: string, riderId: string) {
  const order = await loadOrder(orderId);
  if (order.status !== "SHIPMENT_CREATED" || order.shipment?.status !== "CREATED") throw conflict("This order isn't waiting for a rider");
  const rider = await db.rider.findUnique({ where: { id: riderId }, include: { user: true } });
  if (!rider || rider.user.status !== "ACTIVE" || rider.kycStatus !== "APPROVED") throw notFound("Rider");
  if (await db.shipment.findFirst({ where: { riderId, status: { in: [...ACTIVE_RIDER_STATUSES] } }, select: { id: true } })) throw conflict("This rider is busy with another delivery");
  const actor: OrderActor = { id: user.id, role: "SUPER_ADMIN" };
  await db.$transaction(async (tx) => {
    const r = await tx.shipment.updateMany({ where: { orderId, riderId: null, status: "CREATED" }, data: { riderId, status: "COURIER_ASSIGNED", assignedAt: new Date(), attempts: { increment: 1 } } });
    if (r.count !== 1) throw conflict("A rider just accepted this delivery");
    await transitionOrder(orderId, "COURIER_ASSIGNED", actor, { tx, remarks: `Assigned to ${rider.user.name} by admin` });
  });
  await addEvent(order.shipment.id, "COURIER_ASSIGNED", `Assigned to ${rider.user.name} by admin`);
  await afterTransition(orderId, "SHIPMENT_CREATED", "COURIER_ASSIGNED", actor);
  await notifyUsers([rider.userId], { type: "DELIVERY_JOB", title: "Delivery assigned to you", body: `Pickup at ${order.shop.name} · earn ${formatINR(order.shipment.riderFee)}`, link: "/rider" });
  await notifyDeliveryParties(orderId);
}

/** Cancel the delivery when an order is cancelled (frees the rider). */
export async function cancelDelivery(orderId: string) {
  await db.shipment.updateMany({ where: { orderId, status: { notIn: ["DELIVERED", "CANCELLED"] } }, data: { status: "CANCELLED" } });
}

/** Maintenance: re-offer waiting jobs to riders and alert the shop/admins once when nobody accepts in time. */
export async function sweepWaitingDeliveries() {
  const settings = await getSettings();
  const cutoff = new Date(Date.now() - settings.delivery.riderSearchTimeoutMinutes * 60_000);
  const waiting = await db.shipment.findMany({ where: { status: "CREATED", riderId: null, mode: "RIDER" }, include: { order: { select: { id: true, orderNumber: true, shopId: true } } } });
  let alerted = 0;
  for (const s of waiting) {
    await offerToRiders(s.id).catch(() => 0);
    if (!s.noRiderAlertedAt && s.searchStartedAt && s.searchStartedAt < cutoff) {
      await db.shipment.update({ where: { id: s.id }, data: { noRiderAlertedAt: new Date() } });
      const n = { type: "DELIVERY_ISSUE" as const, title: `No rider yet · ${s.order.orderNumber}`, body: `Nobody accepted this delivery in ${settings.delivery.riderSearchTimeoutMinutes} minutes.` };
      await notifyShop(s.order.shopId, { ...n, body: `${n.body} You can deliver it yourself from the order page.`, link: `/shop/orders/${s.order.id}` });
      await notifyAdmins({ ...n, body: `${n.body} Assign a rider from the order page.`, link: `/admin/orders/${s.order.id}` });
      alerted++;
    }
  }
  return { waiting: waiting.length, alerted };
}

// ───────────────────────────── Live location ─────────────────────────────

export async function updateRiderLocation(user: SessionUser, lat: number, lng: number) {
  const riderId = requireRider(user);
  await db.rider.update({ where: { id: riderId }, data: { lat, lng, locationAt: new Date() } });
  const active = await db.shipment.findFirst({ where: { riderId, status: { in: [...ACTIVE_RIDER_STATUSES] } }, select: { order: { select: { id: true, customerId: true } } } });
  if (active) {
    const cust = await customerUserId(active.order.customerId);
    if (cust) signalUsers([cust], "rider.location", { orderId: active.order.id, lat, lng });
  }
  return { ok: true };
}

/** What the customer's tracking map needs. Rider position only while the rider is on this order. */
export async function trackingFor(order: { id: string; status: string; deliveryLat: number; deliveryLng: number }) {
  const s = await db.shipment.findUnique({
    where: { orderId: order.id },
    include: {
      rider: { select: { lat: true, lng: true, locationAt: true, vehicleType: true, vehicleNumber: true, user: { select: { name: true, phone: true } } } },
      order: { select: { shop: { select: { name: true, contactPhone: true, address: { select: { latitude: true, longitude: true } } } } } },
    },
  });
  if (!s) return null;
  const live = s.mode === "RIDER" && s.rider && (s.status === "COURIER_ASSIGNED" || s.status === "OUT_FOR_DELIVERY");
  const showCode = ["SHIPMENT_CREATED", "COURIER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY"].includes(order.status);
  return {
    mode: s.mode,
    status: s.status,
    deliveryCode: showCode ? s.deliveryCode : null,
    shop: { name: s.order.shop.name, phone: s.mode === "OWN" ? s.order.shop.contactPhone : null, lat: s.order.shop.address?.latitude ?? null, lng: s.order.shop.address?.longitude ?? null },
    drop: { lat: order.deliveryLat, lng: order.deliveryLng },
    rider: live
      ? {
          name: s.rider!.user.name,
          phone: s.rider!.user.phone,
          vehicle: [s.rider!.vehicleType, s.rider!.vehicleNumber].filter(Boolean).join(" · ") || null,
          lat: s.rider!.lat,
          lng: s.rider!.lng,
          at: s.rider!.locationAt,
        }
      : null,
  };
}

async function addEvent(shipmentId: string, status: string, description: string) {
  await db.shipmentTrackingEvent.create({ data: { shipmentId, status, description, source: "SYSTEM", occurredAt: new Date() } });
}
