import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/server/db";
import { AppError, badRequest, conflict, notFound } from "@/server/errors";
import { env, integrationModes } from "@/server/env";
import { safeEqual } from "@/server/auth/password";
import { mapShiprocketStatus, shipping } from "@/server/integrations/shiprocket";
import { ShiprocketError, type CourierOption } from "@/server/integrations/shiprocket/types";
import type { OrderStatusKey } from "@/lib/order-status";
import type { Prisma } from "@/generated/prisma/client";
import { canTransition } from "./order-state";
import { transitionOrder, SYSTEM, type OrderActor } from "./order";
import { getSettings } from "./settings";
import { notifyAdmins, notifyShop, signalUsers, adminUserIds, shopOwnerUserIds } from "./notification";
import { audit } from "./audit";

const STUCK_AFTER_MS = 2 * 60_000;

function pickupNickname(shop: { slug: string; id: string }) {
  return `DX-${shop.slug}`.slice(0, 36);
}

async function loadOrder(orderId: string) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { inventory: { include: { product: true, variant: true } } } },
      shop: { include: { address: true, owner: { include: { user: true } } } },
      customer: { include: { user: true } },
      shipment: true,
    },
  });
  if (!order) throw notFound("Order");
  return order;
}

type LoadedOrder = Awaited<ReturnType<typeof loadOrder>>;

function parcelOf(order: LoadedOrder) {
  let grams = 0;
  let volume = 0;
  let maxL = 10,
    maxB = 10;
  for (const it of order.items) {
    const p = it.inventory.product;
    grams += (it.inventory.variant?.weightGrams ?? p.weightGrams) * it.quantity;
    volume += p.lengthCm * p.breadthCm * p.heightCm * it.quantity;
    maxL = Math.max(maxL, p.lengthCm);
    maxB = Math.max(maxB, p.breadthCm);
  }
  const height = Math.max(5, Math.ceil(volume / (maxL * maxB)));
  return { weightKg: Math.max(0.1, Math.round(grams / 10) / 100), lengthCm: maxL, breadthCm: maxB, heightCm: Math.min(height, 120) };
}

function validateForShipping(order: LoadedOrder) {
  const a = order.shop.address;
  const problems: string[] = [];
  if (!a) problems.push("Shop pickup address is missing");
  else {
    if (!/^\d{6}$/.test(a.pincode)) problems.push("Shop pickup pincode is invalid");
    if (!a.line1 || a.line1.length < 3) problems.push("Shop pickup address line is too short");
  }
  if (!/^\d{6}$/.test(order.deliveryPincode)) problems.push("Delivery pincode is invalid");
  if (!/^[6-9]\d{9}$/.test(order.contactPhone)) problems.push("Customer phone number is invalid");
  if (!/^[6-9]\d{9}$/.test(order.shop.contactPhone)) problems.push("Shop phone number is invalid");
  if (problems.length) throw new AppError(422, "SHIPMENT_VALIDATION", problems.join("; "), problems);
}

export function chooseCourier(options: CourierOption[], strategy: "FASTEST" | "CHEAPEST" | "RECOMMENDED") {
  if (!options.length) return null;
  const sorted = [...options].sort((a, b) => {
    if (strategy === "CHEAPEST") return a.rate - b.rate || (a.etdHours ?? 999) - (b.etdHours ?? 999);
    if (strategy === "RECOMMENDED") return Number(b.recommended) - Number(a.recommended) || (a.etdHours ?? 999) - (b.etdHours ?? 999);
    return (a.etdHours ?? 999) - (b.etdHours ?? 999) || a.rate - b.rate;
  });
  return sorted[0];
}

export async function courierOptions(orderId: string) {
  const order = await loadOrder(orderId);
  validateForShipping(order);
  const parcel = parcelOf(order);
  return shipping().checkServiceability({
    pickupPincode: order.shop.address!.pincode,
    deliveryPincode: order.deliveryPincode,
    weightKg: parcel.weightKg,
    cod: order.paymentMethod === "COD",
    declaredValue: order.total / 100,
    pickupLat: order.shop.address!.latitude,
    pickupLng: order.shop.address!.longitude,
    deliveryLat: order.deliveryLat,
    deliveryLng: order.deliveryLng,
  });
}

async function ensurePickupLocation(order: LoadedOrder) {
  if (order.shop.pickupLocationName) return order.shop.pickupLocationName;
  const a = order.shop.address!;
  const nickname = pickupNickname(order.shop);
  await shipping().addPickupLocation({
    nickname,
    name: order.shop.owner?.user.name ?? order.shop.name,
    email: order.shop.contactEmail ?? order.shop.owner?.user.email ?? "shops@dukaanexpress.in",
    phone: order.shop.contactPhone,
    address: a.line1.length >= 10 ? a.line1 : `${a.line1}, ${a.city}`,
    address2: [a.line2, a.landmark].filter(Boolean).join(", ") || null,
    city: a.city,
    state: a.state,
    pincode: a.pincode,
    lat: a.latitude,
    lng: a.longitude,
  });
  await db.shop.update({ where: { id: order.shopId }, data: { pickupLocationName: nickname } });
  return nickname;
}

/**
 * Shiprocket shipment workflow, triggered when a shop marks an order packed (or on retry).
 *
 * Idempotency:
 *  1. The order is locked with a conditional PACKED → SHIPMENT_CREATING transition (one winner).
 *  2. Shipment.channelOrderId is stable per attempt-series and sent as Shiprocket `order_id`.
 *  3. Before creating, and after any timeout, we reconcile by looking the channel order up in
 *     Shiprocket, so a lost response never produces a duplicate shipment.
 *  4. Every external id is persisted immediately after it is obtained.
 */
export async function createShipmentForOrder(orderId: string, actor: OrderActor, opts: { courierCompanyId?: number } = {}) {
  let order = await loadOrder(orderId);
  const shipmentStuck =
    order.status === "SHIPMENT_CREATING" &&
    order.shipment?.status === "CREATING" &&
    Date.now() - order.shipment.updatedAt.getTime() > STUCK_AFTER_MS;

  if (order.status === "PACKED") {
    validateForShipping(order);
    await transitionOrder(orderId, "SHIPMENT_CREATING", actor.role === "SHOP_OWNER" ? actor : SYSTEM, {
      remarks: "Creating Shiprocket shipment",
      silent: true,
    });
  } else if (!shipmentStuck) {
    throw conflict(
      order.status === "SHIPMENT_CREATING"
        ? "Shipment creation is already in progress"
        : "A shipment can only be created for packed orders",
    );
  }

  const provider = shipping();
  const channelOrderId = order.shipment?.channelOrderId ?? order.orderNumber;
  let shipment = await db.shipment.upsert({
    where: { orderId },
    create: { orderId, provider: provider.name, channelOrderId, status: "CREATING", attempts: 1 },
    update: { status: "CREATING", attempts: { increment: 1 }, lastError: null, provider: provider.name },
  });
  await addEvent(shipment.id, "CREATING", "Shipment creation started", "SYSTEM");
  order = await loadOrder(orderId);

  try {
    const settings = await getSettings();
    const pickupLocation = await ensurePickupLocation(order);
    const parcel = parcelOf(order);

    // Serviceability: never assume a rider is available.
    const options = await courierOptions(orderId);
    if (!options.length) {
      throw new AppError(422, "NO_COURIER", "No courier is currently serviceable for this pickup and delivery location");
    }
    const courier = opts.courierCompanyId
      ? options.find((o) => o.courierCompanyId === opts.courierCompanyId)
      : chooseCourier(options, settings.delivery.courierStrategy);
    if (!courier) throw new AppError(422, "COURIER_UNAVAILABLE", "The selected courier is not available for this shipment");

    // Create (or reconcile) the Shiprocket order.
    if (!shipment.shiprocketShipmentId) {
      const existing = await provider.findOrderByChannelId(shipment.channelOrderId).catch(() => null);
      let created = existing;
      if (!created) {
        const payload = {
          channelOrderId: shipment.channelOrderId,
          orderDate: order.placedAt,
          pickupLocation,
          customer: { name: order.contactName, phone: order.contactPhone, email: order.customer.user.email },
          address: (() => {
            const a = order.addressSnapshot as { line1: string; line2?: string | null; landmark?: string | null; city: string; state: string; pincode: string };
            return { line1: a.line1, line2: [a.line2, a.landmark].filter(Boolean).join(", ") || null, city: a.city, state: a.state, pincode: a.pincode };
          })(),
          items: order.items.map((i) => ({
            name: i.variantName ? `${i.productName} (${i.variantName})` : i.productName,
            sku: i.inventory.shopSku ?? i.inventory.product.sku ?? i.inventoryId,
            units: i.quantity,
            sellingPrice: i.unitPrice / 100,
          })),
          paymentMethod: order.paymentMethod === "COD" ? ("COD" as const) : ("Prepaid" as const),
          subTotal: order.total / 100,
          dimensions: parcel,
        };
        try {
          const c = await provider.createOrder(payload);
          created = { ...c, awbCode: null };
        } catch (e) {
          if (e instanceof ShiprocketError && e.retryable) {
            // Response lost (timeout / 5xx). The order may exist upstream — reconcile, don't recreate.
            created = await provider.findOrderByChannelId(shipment.channelOrderId).catch(() => null);
            if (!created) throw e;
          } else throw e;
        }
      }
      shipment = await db.shipment.update({
        where: { id: shipment.id },
        data: { shiprocketOrderId: created.shiprocketOrderId, shiprocketShipmentId: created.shipmentId, awbCode: created.awbCode ?? undefined },
      });
      await addEvent(shipment.id, "CREATED", `Shiprocket order ${created.shiprocketOrderId} / shipment ${created.shipmentId}`, "SYSTEM");
    }

    // Assign courier / AWB.
    if (!shipment.awbCode) {
      const awb = await provider.assignAwb(shipment.shiprocketShipmentId!, courier.courierCompanyId);
      const partner = await db.deliveryPartner.upsert({
        where: { shiprocketCourierId: awb.courierCompanyId },
        create: { name: awb.courierName, shiprocketCourierId: awb.courierCompanyId },
        update: { name: awb.courierName },
      });
      shipment = await db.shipment.update({
        where: { id: shipment.id },
        data: {
          awbCode: awb.awbCode,
          courierCompanyId: awb.courierCompanyId,
          courierName: awb.courierName,
          deliveryPartnerId: partner.id,
          freightCharge: courier.rate,
          etd: courier.etd,
          status: "COURIER_ASSIGNED",
          trackingUrl: provider.name === "SHIPROCKET" ? `https://shiprocket.co/tracking/${awb.awbCode}` : null,
        },
      });
      await addEvent(shipment.id, "COURIER_ASSIGNED", `AWB ${awb.awbCode} · ${awb.courierName}`, "SYSTEM");
    }

    // Pickup + label are best-effort; failures are recorded but do not undo the shipment.
    if (settings.delivery.autoSchedulePickup && !shipment.pickupScheduledAt) {
      try {
        const p = await provider.schedulePickup(shipment.shiprocketShipmentId!);
        shipment = await db.shipment.update({
          where: { id: shipment.id },
          data: { pickupScheduledAt: p.scheduledAt ?? new Date(), pickupToken: p.token, status: "PICKUP_SCHEDULED" },
        });
        await addEvent(shipment.id, "PICKUP_SCHEDULED", p.token ? `Pickup token ${p.token}` : "Pickup requested", "SYSTEM");
      } catch (e) {
        await db.shipment.update({ where: { id: shipment.id }, data: { lastError: `Pickup scheduling: ${(e as Error).message}`, lastErrorAt: new Date() } });
      }
    }
    if (!shipment.labelUrl) {
      try {
        const l = await provider.generateLabel(shipment.shiprocketShipmentId!);
        if (l.labelUrl) shipment = await db.shipment.update({ where: { id: shipment.id }, data: { labelUrl: l.labelUrl } });
      } catch (e) {
        console.warn("[shipment] label generation failed", e);
      }
    }

    await transitionOrder(orderId, "SHIPMENT_CREATED", SYSTEM, { remarks: `AWB ${shipment.awbCode} via ${shipment.courierName}` });
    await audit({ id: actor.id, role: actor.role }, "shipment.create", "Shipment", shipment.id, {
      after: { awb: shipment.awbCode, courier: shipment.courierName, provider: provider.name },
    });
    return { ok: true as const, shipment };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Shipment creation failed";
    shipment = await db.shipment.update({
      where: { id: shipment.id },
      data: { status: "EXCEPTION", lastError: message, lastErrorAt: new Date() },
    });
    await addEvent(shipment.id, "EXCEPTION", message, "SYSTEM");
    const current = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    if (current.status === "SHIPMENT_CREATING") {
      await transitionOrder(orderId, "PACKED", SYSTEM, { remarks: `Shipment exception: ${message}`, silent: true });
    }
    const n = {
      type: "SHIPMENT_EXCEPTION" as const,
      title: `Shipment exception · ${order.orderNumber}`,
      body: `${message}. Retry or choose another courier.`,
    };
    await notifyAdmins({ ...n, link: `/admin/orders/${orderId}` });
    await notifyShop(order.shopId, { ...n, link: `/shop/orders/${orderId}` });
    return { ok: false as const, shipment, error: message };
  }
}

/** Cancel the Shiprocket order so a different courier can be chosen (or because the order was cancelled). */
export async function cancelShipment(orderId: string, actor: OrderActor, opts: { keepOrderStatus?: boolean } = {}) {
  const order = await loadOrder(orderId);
  const s = order.shipment;
  if (!s) throw notFound("Shipment");
  if (["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"].includes(s.status))
    throw conflict("The shipment has already been picked up and cannot be cancelled");
  if (s.shiprocketOrderId) {
    try {
      await shipping().cancelOrder(s.shiprocketOrderId);
    } catch (e) {
      throw new AppError(502, "SHIPROCKET_CANCEL_FAILED", `Could not cancel at Shiprocket: ${(e as Error).message}`);
    }
  }
  // Re-creating needs a fresh channel order id, since Shiprocket keeps cancelled orders.
  const suffix = s.attempts + 1;
  await db.shipment.update({
    where: { id: s.id },
    data: {
      status: "CANCELLED",
      channelOrderId: `${order.orderNumber}-R${suffix}`,
      shiprocketOrderId: null,
      shiprocketShipmentId: null,
      awbCode: null,
      courierCompanyId: null,
      courierName: null,
      labelUrl: null,
      pickupScheduledAt: null,
      pickupToken: null,
    },
  });
  await addEvent(s.id, "CANCELLED", `Shipment cancelled by ${actor.role.toLowerCase()}`, "SYSTEM");
  if (!opts.keepOrderStatus && canTransition(order.status as OrderStatusKey, "PACKED", "SYSTEM")) {
    await transitionOrder(orderId, "PACKED", SYSTEM, { remarks: "Shipment cancelled — ready to re-ship", silent: true });
  }
  await audit({ id: actor.id, role: actor.role }, "shipment.cancel", "Shipment", s.id);
}

async function addEvent(shipmentId: string, status: string, description: string, source: "SYSTEM" | "WEBHOOK" | "POLL", extra: { rawStatus?: string; location?: string | null; occurredAt?: Date } = {}) {
  await db.shipmentTrackingEvent.create({
    data: {
      shipmentId,
      status,
      description,
      source,
      rawStatus: extra.rawStatus,
      location: extra.location ?? null,
      occurredAt: extra.occurredAt ?? new Date(),
    },
  });
}

// ───────────────────────────── Tracking updates ─────────────────────────────

const FORWARD_CHAIN: OrderStatusKey[] = ["SHIPMENT_CREATED", "COURIER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED"];

const SHIPMENT_TO_ORDER: Record<string, OrderStatusKey | null> = {
  COURIER_ASSIGNED: null,
  PICKUP_SCHEDULED: "COURIER_ASSIGNED",
  PICKED_UP: "PICKED_UP",
  IN_TRANSIT: "PICKED_UP",
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  DELIVERED: "DELIVERED",
  FAILED_ATTEMPT: "DELIVERY_FAILED",
};

export interface TrackingUpdate {
  awbCode?: string | null;
  channelOrderId?: string | null;
  statusLabel: string;
  statusId?: number | null;
  occurredAt?: Date;
  location?: string | null;
  description?: string | null;
  riderName?: string | null;
  riderPhone?: string | null;
  source: "WEBHOOK" | "POLL";
}

export async function applyTrackingUpdate(u: TrackingUpdate) {
  const shipment = await db.shipment.findFirst({
    where: { OR: [...(u.awbCode ? [{ awbCode: u.awbCode }] : []), ...(u.channelOrderId ? [{ channelOrderId: u.channelOrderId }] : [])] },
    include: { order: true },
  });
  if (!shipment) return { matched: false };
  const occurredAt = u.occurredAt ?? new Date();
  const mapped = mapShiprocketStatus(u.statusLabel, u.statusId);

  const dup = await db.shipmentTrackingEvent.findFirst({
    where: { shipmentId: shipment.id, rawStatus: u.statusLabel, occurredAt },
  });
  if (dup) return { matched: true, duplicate: true };
  await addEvent(shipment.id, mapped ?? u.statusLabel.toUpperCase(), u.description ?? u.statusLabel, u.source, {
    rawStatus: u.statusLabel,
    location: u.location,
    occurredAt,
  });
  if (!mapped) return { matched: true, mapped: null };

  await db.shipment.update({
    where: { id: shipment.id },
    data: {
      status: mapped as Prisma.ShipmentUpdateInput["status"] & string,
      ...(u.riderName ? { riderName: u.riderName } : {}),
      ...(u.riderPhone ? { riderPhone: u.riderPhone } : {}),
    },
  });

  const target = SHIPMENT_TO_ORDER[mapped];
  if (target === "DELIVERY_FAILED") {
    if (canTransition(shipment.order.status as OrderStatusKey, "DELIVERY_FAILED", "SYSTEM")) {
      await transitionOrder(shipment.orderId, "DELIVERY_FAILED", SYSTEM, { remarks: u.description ?? u.statusLabel });
    }
  } else if (target) {
    await advanceAlongChain(shipment.orderId, target, u.description ?? u.statusLabel);
  } else if (["RTO", "EXCEPTION", "CANCELLED"].includes(mapped)) {
    const n = { type: "SHIPMENT_EXCEPTION" as const, title: `Shipment ${mapped.toLowerCase()} · ${shipment.order.orderNumber}`, body: u.description ?? u.statusLabel };
    await notifyAdmins({ ...n, link: `/admin/orders/${shipment.orderId}` });
    await notifyShop(shipment.order.shopId, { ...n, link: `/shop/orders/${shipment.orderId}` });
  }
  signalUsers([...(await adminUserIds()), ...(await shopOwnerUserIds(shipment.order.shopId))], "order.updated", { orderId: shipment.orderId });
  return { matched: true, mapped };
}

/** Walk the order forward one validated step at a time (webhooks can skip intermediate states). */
async function advanceAlongChain(orderId: string, target: OrderStatusKey, remarks: string) {
  for (let guard = 0; guard < 6; guard++) {
    const o = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    const cur = o.status as OrderStatusKey;
    if (cur === target) return;
    if (canTransition(cur, target, "SYSTEM")) {
      await transitionOrder(orderId, target, SYSTEM, { remarks });
      return;
    }
    const idx = FORWARD_CHAIN.indexOf(cur === "DELIVERY_FAILED" ? "PICKED_UP" : cur);
    const tIdx = FORWARD_CHAIN.indexOf(target);
    if (idx < 0 || tIdx <= idx) return; // out of order / stale event — ignore
    const next = cur === "DELIVERY_FAILED" ? "OUT_FOR_DELIVERY" : FORWARD_CHAIN[idx + 1];
    if (!canTransition(cur, next, "SYSTEM")) return;
    await transitionOrder(orderId, next, SYSTEM, { remarks: `${remarks} (auto)` , silent: next !== target });
  }
}

// ───────────────────────────── Webhook ─────────────────────────────

interface ShiprocketWebhook {
  awb?: string | number;
  order_id?: string;
  current_status?: string;
  current_status_id?: number;
  shipment_status?: string;
  shipment_status_id?: number;
  current_timestamp?: string;
  courier_name?: string;
  scans?: { date: string; activity?: string; location?: string; "sr-status-label"?: string }[];
}

/** Shiprocket sends the token configured in its panel in the `x-api-key` header. */
export async function handleShiprocketWebhook(rawBody: string, token: string | null, internal = false) {
  const configured = env().SHIPROCKET_WEBHOOK_TOKEN;
  const valid = internal || (configured ? !!token && safeEqual(configured, token) : integrationModes().shiprocket === "mock");
  let body: ShiprocketWebhook;
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw badRequest("Invalid JSON");
  }
  const label = body.current_status ?? body.shipment_status ?? "UNKNOWN";
  const eventId = createHash("sha256").update(`${body.awb}|${label}|${body.current_timestamp ?? ""}`).digest("hex");
  const existing = await db.webhookEvent.findUnique({ where: { provider_eventId: { provider: "SHIPROCKET", eventId } } });
  if (existing?.processedAt) return { duplicate: true };
  const ev =
    existing ??
    (await db.webhookEvent.create({
      data: { provider: "SHIPROCKET", eventId, eventType: label, payload: body as unknown as Prisma.InputJsonValue, signatureValid: valid },
    }));
  if (!valid) {
    await db.webhookEvent.update({ where: { id: ev.id }, data: { error: "Invalid token" } });
    throw new AppError(401, "INVALID_TOKEN", "Invalid webhook token");
  }
  try {
    const res = await applyTrackingUpdate({
      awbCode: body.awb != null ? String(body.awb) : null,
      channelOrderId: body.order_id ?? null,
      statusLabel: label,
      statusId: body.current_status_id ?? body.shipment_status_id ?? null,
      occurredAt: body.current_timestamp ? parseSrDate(body.current_timestamp) : new Date(),
      location: body.scans?.[body.scans.length - 1]?.location ?? null,
      description: body.scans?.[body.scans.length - 1]?.activity ?? label,
      source: "WEBHOOK",
    });
    await db.webhookEvent.update({ where: { id: ev.id }, data: { processedAt: new Date(), attempts: { increment: 1 }, error: res.matched ? null : "No matching shipment" } });
    return res;
  } catch (e) {
    await db.webhookEvent.update({ where: { id: ev.id }, data: { attempts: { increment: 1 }, error: (e as Error).message } });
    throw e;
  }
}

/** Shiprocket timestamps look like "23 05 2023 11:43:52" or ISO strings. */
function parseSrDate(s: string) {
  const m = s.match(/^(\d{2})[ -](\d{2})[ -](\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}+05:30`);
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date() : d;
}

/** Pull tracking from Shiprocket (used by the "refresh tracking" button and the cron). */
export async function refreshTracking(orderId: string) {
  const order = await loadOrder(orderId);
  if (!order.shipment?.awbCode) throw badRequest("No AWB assigned yet");
  const t = await shipping().track(order.shipment.awbCode);
  for (const a of [...t.activities].reverse()) {
    await applyTrackingUpdate({ awbCode: order.shipment.awbCode, statusLabel: a.status, occurredAt: a.occurredAt, location: a.location, description: a.activity, source: "POLL" });
  }
  if (t.trackUrl) await db.shipment.update({ where: { id: order.shipment.id }, data: { trackingUrl: t.trackUrl, etd: t.etd ?? undefined } });
  return t;
}

/**
 * SANDBOX ONLY: emits the next courier status through the exact webhook pipeline Shiprocket uses,
 * so the full lifecycle can be exercised without real credentials.
 */
export async function simulateNextCourierEvent(orderId: string) {
  if (integrationModes().shiprocket !== "mock") throw badRequest("Courier simulation is only available in sandbox mode");
  const order = await loadOrder(orderId);
  const s = order.shipment;
  if (!s?.awbCode) throw badRequest("Create the shipment first");
  const NEXT: Partial<Record<OrderStatusKey, { status: string; id: number }>> = {
    SHIPMENT_CREATED: { status: "OUT FOR PICKUP", id: 19 },
    COURIER_ASSIGNED: { status: "PICKED UP", id: 42 },
    PICKED_UP: { status: "OUT FOR DELIVERY", id: 17 },
    OUT_FOR_DELIVERY: { status: "DELIVERED", id: 7 },
    DELIVERY_FAILED: { status: "OUT FOR DELIVERY", id: 17 },
  };
  const next = NEXT[order.status as OrderStatusKey];
  if (!next) throw badRequest("No further courier events for this order status");
  const payload = {
    awb: s.awbCode,
    order_id: s.channelOrderId,
    current_status: next.status,
    current_status_id: next.id,
    current_timestamp: new Date().toISOString(),
    courier_name: s.courierName,
    scans: [{ date: new Date().toISOString(), activity: `${next.status} (sandbox)`, location: order.shop.address?.city ?? "" }],
  };
  if (next.status === "OUT FOR PICKUP") {
    await db.shipment.update({ where: { id: s.id }, data: { riderName: "Ravi K. (sandbox rider)", riderPhone: "9000000001" } });
  }
  return handleShiprocketWebhook(JSON.stringify(payload), null, true);
}
