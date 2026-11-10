import "server-only";
import { integrationModes } from "@/server/env";
import { ShiprocketClient } from "./client";
import { ShiprocketMock } from "./mock";
import type { ShippingProvider } from "./types";

let instance: ShippingProvider | null = null;

export function shipping(): ShippingProvider {
  if (!instance) instance = integrationModes().shiprocket === "live" ? new ShiprocketClient() : new ShiprocketMock();
  return instance;
}

/** For tests only. */
export function setShippingProvider(p: ShippingProvider | null) {
  instance = p;
}

/**
 * Map a Shiprocket status (label or numeric id from webhooks / tracking) to our ShipmentStatus.
 * Reference: Shiprocket shipment status codes (6 Shipped, 7 Delivered, 8 Cancelled, 9 RTO Initiated,
 * 17 Out For Delivery, 18 In Transit, 19 Out For Pickup, 20 Pickup Exception, 21 Undelivered, 42 Picked Up …).
 */
export function mapShiprocketStatus(label: string | null | undefined, id?: number | null) {
  const s = (label ?? "").toUpperCase().replace(/[_-]/g, " ").trim();
  const byId: Record<number, string> = {
    6: "IN_TRANSIT",
    7: "DELIVERED",
    8: "CANCELLED",
    9: "RTO",
    10: "RTO",
    13: "EXCEPTION",
    15: "PICKUP_SCHEDULED",
    17: "OUT_FOR_DELIVERY",
    18: "IN_TRANSIT",
    19: "PICKUP_SCHEDULED",
    20: "EXCEPTION",
    21: "FAILED_ATTEMPT",
    38: "IN_TRANSIT",
    42: "PICKED_UP",
  };
  if (s.includes("RTO")) return "RTO";
  if (s.includes("UNDELIVERED") || s.includes("FAILED")) return "FAILED_ATTEMPT";
  if (s === "DELIVERED") return "DELIVERED";
  if (s.includes("OUT FOR DELIVERY")) return "OUT_FOR_DELIVERY";
  if (s.includes("PICKED UP") || s === "SHIPPED") return "PICKED_UP";
  if (s.includes("IN TRANSIT") || s.includes("REACHED")) return "IN_TRANSIT";
  if (s.includes("OUT FOR PICKUP") || s.includes("PICKUP SCHEDULED") || s.includes("PICKUP GENERATED") || s.includes("PICKUP RESCHEDULED"))
    return "PICKUP_SCHEDULED";
  if (s.includes("PICKUP EXCEPTION") || s.includes("LOST") || s.includes("DAMAGED")) return "EXCEPTION";
  if (s.includes("CANCEL")) return "CANCELLED";
  if (s.includes("AWB ASSIGNED") || s.includes("COURIER ASSIGNED")) return "COURIER_ASSIGNED";
  if (id != null && byId[id]) return byId[id];
  return null;
}

export type { ShippingProvider } from "./types";
