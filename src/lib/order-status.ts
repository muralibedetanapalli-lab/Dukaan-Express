// Client-safe order status metadata (labels, colours, customer timeline).
export const ORDER_STATUSES = [
  "CREATED",
  "PAYMENT_PENDING",
  "PAYMENT_CONFIRMED",
  "SHOP_PENDING",
  "SHOP_ACCEPTED",
  "SHOP_REJECTED",
  "PREPARING",
  "READY_FOR_PACKING",
  "PACKED",
  "SHIPMENT_CREATING",
  "SHIPMENT_CREATED",
  "COURIER_ASSIGNED",
  "PICKED_UP",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
  "REFUND_PENDING",
  "REFUNDED",
  "DELIVERY_FAILED",
] as const;
export type OrderStatusKey = (typeof ORDER_STATUSES)[number];

type Tone = "neutral" | "info" | "warning" | "success" | "danger" | "primary";

export const STATUS_META: Record<OrderStatusKey, { label: string; tone: Tone }> = {
  CREATED: { label: "Created", tone: "neutral" },
  PAYMENT_PENDING: { label: "Payment pending", tone: "warning" },
  PAYMENT_CONFIRMED: { label: "Payment confirmed", tone: "info" },
  SHOP_PENDING: { label: "Awaiting shop", tone: "warning" },
  SHOP_ACCEPTED: { label: "Accepted", tone: "info" },
  SHOP_REJECTED: { label: "Rejected by shop", tone: "danger" },
  PREPARING: { label: "Preparing", tone: "info" },
  READY_FOR_PACKING: { label: "Ready for packing", tone: "info" },
  PACKED: { label: "Packed", tone: "primary" },
  SHIPMENT_CREATING: { label: "Creating shipment", tone: "primary" },
  SHIPMENT_CREATED: { label: "Awaiting pickup", tone: "primary" },
  COURIER_ASSIGNED: { label: "Rider assigned", tone: "primary" },
  PICKED_UP: { label: "Picked up", tone: "primary" },
  OUT_FOR_DELIVERY: { label: "Out for delivery", tone: "primary" },
  DELIVERED: { label: "Delivered", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
  REFUND_PENDING: { label: "Refund pending", tone: "warning" },
  REFUNDED: { label: "Refunded", tone: "neutral" },
  DELIVERY_FAILED: { label: "Delivery failed", tone: "danger" },
};

/** Customer-facing timeline. Each step is "reached" once the order passed any of its statuses. */
export const CUSTOMER_TIMELINE: { key: string; label: string; statuses: OrderStatusKey[] }[] = [
  { key: "placed", label: "Order placed", statuses: ["CREATED", "PAYMENT_PENDING", "SHOP_PENDING"] },
  { key: "paid", label: "Payment confirmed", statuses: ["PAYMENT_CONFIRMED"] },
  { key: "accepted", label: "Shop accepted", statuses: ["SHOP_ACCEPTED"] },
  { key: "preparing", label: "Preparing order", statuses: ["PREPARING"] },
  { key: "ready", label: "Ready for packing", statuses: ["READY_FOR_PACKING"] },
  { key: "packed", label: "Order packed", statuses: ["PACKED", "SHIPMENT_CREATING"] },
  { key: "shipment", label: "Shipment created", statuses: ["SHIPMENT_CREATED"] },
  { key: "rider", label: "Rider assigned", statuses: ["COURIER_ASSIGNED"] },
  { key: "picked", label: "Picked up", statuses: ["PICKED_UP"] },
  { key: "ofd", label: "Out for delivery", statuses: ["OUT_FOR_DELIVERY"] },
  { key: "delivered", label: "Delivered", statuses: ["DELIVERED"] },
];

export const TERMINAL_STATUSES: OrderStatusKey[] = ["DELIVERED", "CANCELLED", "REFUNDED", "SHOP_REJECTED"];

export const ACTIVE_SHOP_STATUSES: OrderStatusKey[] = [
  "SHOP_PENDING",
  "SHOP_ACCEPTED",
  "PREPARING",
  "READY_FOR_PACKING",
  "PACKED",
  "SHIPMENT_CREATING",
  "SHIPMENT_CREATED",
  "COURIER_ASSIGNED",
];

export const SHIPMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  CREATING: "Creating",
  CREATED: "Created",
  COURIER_ASSIGNED: "Courier assigned",
  PICKUP_SCHEDULED: "Pickup scheduled",
  PICKED_UP: "Picked up",
  IN_TRANSIT: "In transit",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  FAILED_ATTEMPT: "Failed attempt",
  RTO: "Returned to origin",
  CANCELLED: "Cancelled",
  EXCEPTION: "Exception",
};
