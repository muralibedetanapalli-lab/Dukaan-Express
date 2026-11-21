/** Shared (client + server) labels for shop-to-shop bulk orders. */

export type BulkStatus = "PAYMENT_PENDING" | "PLACED" | "ACCEPTED" | "DISPATCHED" | "READY_FOR_PICKUP" | "DELIVERED" | "REJECTED" | "CANCELLED";

export const BULK_STATUS: Record<BulkStatus, { label: string; tone: "neutral" | "warning" | "primary" | "success" | "danger" | "info" }> = {
  PAYMENT_PENDING: { label: "Awaiting payment", tone: "warning" },
  PLACED: { label: "Waiting for seller", tone: "warning" },
  ACCEPTED: { label: "Accepted", tone: "info" },
  DISPATCHED: { label: "Out for delivery", tone: "primary" },
  READY_FOR_PICKUP: { label: "Ready for pickup", tone: "primary" },
  DELIVERED: { label: "Completed", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export const BULK_FULFILMENT_LABEL = { DELIVERY: "Seller delivers", PICKUP: "Buyer picks up" } as const;
export const BULK_PAYMENT_LABEL = { ONLINE: "Paid online", ON_DELIVERY: "Pay on delivery / pickup" } as const;
