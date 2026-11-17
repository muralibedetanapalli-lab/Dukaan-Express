import { describe, expect, it } from "vitest";
import { canTransition, isValidTransition, nextStatuses, SHOP_FORWARD_ACTION } from "@/server/services/order-state";

describe("order state machine", () => {
  it("lets shops walk the packing workflow in order", () => {
    expect(canTransition("SHOP_PENDING", "SHOP_ACCEPTED", "SHOP_OWNER")).toBe(true);
    expect(canTransition("SHOP_ACCEPTED", "PREPARING", "SHOP_OWNER")).toBe(true);
    expect(canTransition("PREPARING", "READY_FOR_PACKING", "SHOP_OWNER")).toBe(true);
    expect(canTransition("READY_FOR_PACKING", "PACKED", "SHOP_OWNER")).toBe(true);
  });

  it("forbids skipping steps", () => {
    expect(isValidTransition("SHOP_PENDING", "PACKED")).toBe(false);
    expect(isValidTransition("SHOP_ACCEPTED", "READY_FOR_PACKING")).toBe(false);
    expect(isValidTransition("PAYMENT_PENDING", "SHOP_ACCEPTED")).toBe(false);
  });

  it("enforces who may perform each transition", () => {
    expect(canTransition("SHOP_PENDING", "SHOP_ACCEPTED", "CUSTOMER")).toBe(false);
    expect(canTransition("PAYMENT_PENDING", "PAYMENT_CONFIRMED", "CUSTOMER")).toBe(false);
    expect(canTransition("PAYMENT_PENDING", "PAYMENT_CONFIRMED", "SYSTEM")).toBe(true);
    // Delivering: the rider or the shop (own delivery) — never the customer. Who exactly is checked by the delivery service.
    expect(canTransition("OUT_FOR_DELIVERY", "DELIVERED", "RIDER")).toBe(true);
    expect(canTransition("OUT_FOR_DELIVERY", "DELIVERED", "SHOP_OWNER")).toBe(true);
    expect(canTransition("OUT_FOR_DELIVERY", "DELIVERED", "CUSTOMER")).toBe(false);
    // Only riders (or the system) accept and pick up; shops can't fake a pickup.
    expect(canTransition("SHIPMENT_CREATED", "COURIER_ASSIGNED", "RIDER")).toBe(true);
    expect(canTransition("COURIER_ASSIGNED", "PICKED_UP", "SHOP_OWNER")).toBe(false);
    expect(canTransition("PACKED", "CANCELLED", "RIDER")).toBe(false);
    // shops can't cancel after accepting; only admins can
    expect(canTransition("PREPARING", "CANCELLED", "SHOP_OWNER")).toBe(false);
    expect(canTransition("PREPARING", "CANCELLED", "SUPER_ADMIN")).toBe(true);
  });

  it("does not allow leaving terminal states except into refunds", () => {
    expect(nextStatuses("REFUNDED", "SUPER_ADMIN")).toEqual([]);
    expect(nextStatuses("CANCELLED", "SYSTEM")).toEqual(["REFUND_PENDING"]);
  });

  it("supports both delivery modes and rider hand-back", () => {
    expect(canTransition("PACKED", "SHIPMENT_CREATED", "SYSTEM")).toBe(true); // rider mode: find a rider
    expect(canTransition("PACKED", "OUT_FOR_DELIVERY", "SHOP_OWNER")).toBe(true); // own delivery
    expect(canTransition("SHIPMENT_CREATED", "OUT_FOR_DELIVERY", "SHOP_OWNER")).toBe(true); // no rider → deliver yourself
    expect(canTransition("COURIER_ASSIGNED", "SHIPMENT_CREATED", "RIDER")).toBe(true); // rider gives it back
    expect(canTransition("SHIPMENT_CREATING", "PACKED", "SYSTEM")).toBe(true); // legacy rows
  });

  it("exposes one forward button per shop step", () => {
    expect(SHOP_FORWARD_ACTION.SHOP_PENDING?.label).toBe("Accept Order");
    expect(SHOP_FORWARD_ACTION.READY_FOR_PACKING?.label).toBe("Order Packed");
    expect(SHOP_FORWARD_ACTION.PACKED).toBeUndefined();
  });
});
