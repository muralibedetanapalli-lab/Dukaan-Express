// Pure order state machine — no I/O so it is trivially unit-testable.
import type { OrderStatusKey } from "@/lib/order-status";

export type ActorRole = "CUSTOMER" | "SHOP_OWNER" | "SUPER_ADMIN" | "SYSTEM" | "RIDER";

const S: ActorRole[] = ["SYSTEM"];
const SA: ActorRole[] = ["SYSTEM", "SUPER_ADMIN"];
const SHOP: ActorRole[] = ["SHOP_OWNER", "SUPER_ADMIN"];
const ADMIN: ActorRole[] = ["SUPER_ADMIN"];
const CUST_ADMIN: ActorRole[] = ["CUSTOMER", "SUPER_ADMIN", "SYSTEM"];
/** Steps a rider takes on their assigned delivery (the delivery service checks it is *their* order). */
const RIDER_SA: ActorRole[] = ["RIDER", "SYSTEM", "SUPER_ADMIN"];
/** Delivering: the rider (company delivery) or the shop's own staff (own delivery). */
const DELIVERER: ActorRole[] = ["RIDER", "SHOP_OWNER", "SYSTEM", "SUPER_ADMIN"];

/**
 * from → to → roles allowed to perform that transition.
 *
 * Delivery after PACKED:
 *  - Company rider: PACKED → SHIPMENT_CREATED ("finding a rider") → COURIER_ASSIGNED (rider accepted)
 *    → PICKED_UP → OUT_FOR_DELIVERY → DELIVERED. A rider can drop the job before pickup (back to SHIPMENT_CREATED).
 *  - Own delivery: PACKED → OUT_FOR_DELIVERY (shop dispatches) → DELIVERED. While still looking for a rider,
 *    the shop can switch to delivering it themselves (SHIPMENT_CREATED → OUT_FOR_DELIVERY).
 */
export const TRANSITIONS: Partial<Record<OrderStatusKey, Partial<Record<OrderStatusKey, ActorRole[]>>>> = {
  CREATED: { PAYMENT_PENDING: S, SHOP_PENDING: S, CANCELLED: SA },
  PAYMENT_PENDING: { PAYMENT_CONFIRMED: S, CANCELLED: CUST_ADMIN },
  PAYMENT_CONFIRMED: { SHOP_PENDING: S, CANCELLED: CUST_ADMIN },
  SHOP_PENDING: { SHOP_ACCEPTED: SHOP, SHOP_REJECTED: [...SHOP, "SYSTEM"], CANCELLED: CUST_ADMIN },
  SHOP_ACCEPTED: { PREPARING: SHOP, CANCELLED: CUST_ADMIN },
  PREPARING: { READY_FOR_PACKING: SHOP, CANCELLED: ADMIN },
  READY_FOR_PACKING: { PACKED: SHOP, CANCELLED: ADMIN },
  PACKED: { SHIPMENT_CREATED: SA, OUT_FOR_DELIVERY: SHOP, CANCELLED: ADMIN },
  // Legacy (Shiprocket era): only ever moved back to PACKED.
  SHIPMENT_CREATING: { PACKED: SA },
  SHIPMENT_CREATED: { COURIER_ASSIGNED: RIDER_SA, OUT_FOR_DELIVERY: SHOP, PACKED: SA, CANCELLED: ADMIN },
  COURIER_ASSIGNED: { PICKED_UP: RIDER_SA, SHIPMENT_CREATED: RIDER_SA, CANCELLED: ADMIN },
  PICKED_UP: { OUT_FOR_DELIVERY: RIDER_SA, DELIVERED: RIDER_SA, DELIVERY_FAILED: RIDER_SA },
  OUT_FOR_DELIVERY: { DELIVERED: DELIVERER, DELIVERY_FAILED: DELIVERER },
  DELIVERY_FAILED: { OUT_FOR_DELIVERY: [...SA, "SHOP_OWNER"], REFUND_PENDING: SA, CANCELLED: ADMIN },
  SHOP_REJECTED: { REFUND_PENDING: SA },
  CANCELLED: { REFUND_PENDING: SA },
  REFUND_PENDING: { REFUNDED: SA },
  DELIVERED: { REFUND_PENDING: ADMIN },
};

export function canTransition(from: OrderStatusKey, to: OrderStatusKey, role: ActorRole) {
  const allowed = TRANSITIONS[from]?.[to];
  return !!allowed && allowed.includes(role);
}

export function isValidTransition(from: OrderStatusKey, to: OrderStatusKey) {
  return !!TRANSITIONS[from]?.[to];
}

export function nextStatuses(from: OrderStatusKey, role: ActorRole): OrderStatusKey[] {
  const map = TRANSITIONS[from] ?? {};
  return (Object.keys(map) as OrderStatusKey[]).filter((to) => map[to]!.includes(role));
}

/** The single forward action a shop owner can take for an order in a given status. */
export const SHOP_FORWARD_ACTION: Partial<Record<OrderStatusKey, { to: OrderStatusKey; label: string }>> = {
  SHOP_PENDING: { to: "SHOP_ACCEPTED", label: "Accept Order" },
  SHOP_ACCEPTED: { to: "PREPARING", label: "Start Preparing" },
  PREPARING: { to: "READY_FOR_PACKING", label: "Ready for Packing" },
  READY_FOR_PACKING: { to: "PACKED", label: "Order Packed" },
};

/** Statuses in which stock is still reserved for the order (used when releasing on cancel). */
export const STOCK_RESERVED_STATUSES: OrderStatusKey[] = [
  "CREATED",
  "PAYMENT_PENDING",
  "PAYMENT_CONFIRMED",
  "SHOP_PENDING",
  "SHOP_ACCEPTED",
  "PREPARING",
  "READY_FOR_PACKING",
  "PACKED",
  "SHIPMENT_CREATING",
  "SHIPMENT_CREATED",
  "COURIER_ASSIGNED",
];
