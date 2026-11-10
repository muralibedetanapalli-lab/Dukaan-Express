// Pure order state machine — no I/O so it is trivially unit-testable.
import type { OrderStatusKey } from "@/lib/order-status";

export type ActorRole = "CUSTOMER" | "SHOP_OWNER" | "SUPER_ADMIN" | "SYSTEM";

const S: ActorRole[] = ["SYSTEM"];
const SA: ActorRole[] = ["SYSTEM", "SUPER_ADMIN"];
const SHOP: ActorRole[] = ["SHOP_OWNER", "SUPER_ADMIN"];
const ADMIN: ActorRole[] = ["SUPER_ADMIN"];
const CUST_ADMIN: ActorRole[] = ["CUSTOMER", "SUPER_ADMIN", "SYSTEM"];

/** from → to → roles allowed to perform that transition */
export const TRANSITIONS: Partial<Record<OrderStatusKey, Partial<Record<OrderStatusKey, ActorRole[]>>>> = {
  CREATED: { PAYMENT_PENDING: S, SHOP_PENDING: S, CANCELLED: SA },
  PAYMENT_PENDING: { PAYMENT_CONFIRMED: S, CANCELLED: CUST_ADMIN },
  PAYMENT_CONFIRMED: { SHOP_PENDING: S, CANCELLED: CUST_ADMIN },
  SHOP_PENDING: { SHOP_ACCEPTED: SHOP, SHOP_REJECTED: [...SHOP, "SYSTEM"], CANCELLED: CUST_ADMIN },
  SHOP_ACCEPTED: { PREPARING: SHOP, CANCELLED: CUST_ADMIN },
  PREPARING: { READY_FOR_PACKING: SHOP, CANCELLED: ADMIN },
  READY_FOR_PACKING: { PACKED: SHOP, CANCELLED: ADMIN },
  PACKED: { SHIPMENT_CREATING: ["SYSTEM", "SHOP_OWNER", "SUPER_ADMIN"], CANCELLED: ADMIN },
  SHIPMENT_CREATING: { SHIPMENT_CREATED: S, COURIER_ASSIGNED: S, PACKED: SA },
  SHIPMENT_CREATED: { COURIER_ASSIGNED: SA, PICKED_UP: SA, PACKED: SA, CANCELLED: ADMIN },
  COURIER_ASSIGNED: { PICKED_UP: SA, OUT_FOR_DELIVERY: SA, PACKED: SA, CANCELLED: ADMIN },
  PICKED_UP: { OUT_FOR_DELIVERY: SA, DELIVERED: SA, DELIVERY_FAILED: SA },
  OUT_FOR_DELIVERY: { DELIVERED: SA, DELIVERY_FAILED: SA },
  DELIVERY_FAILED: { OUT_FOR_DELIVERY: SA, REFUND_PENDING: SA, CANCELLED: ADMIN },
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
