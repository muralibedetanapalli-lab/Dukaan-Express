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
    expect(canTransition("OUT_FOR_DELIVERY", "DELIVERED", "SHOP_OWNER")).toBe(false);
    expect(canTransition("OUT_FOR_DELIVERY", "DELIVERED", "SYSTEM")).toBe(true);
    // shops can't cancel after accepting; only admins can
    expect(canTransition("PREPARING", "CANCELLED", "SHOP_OWNER")).toBe(false);
    expect(canTransition("PREPARING", "CANCELLED", "SUPER_ADMIN")).toBe(true);
  });

  it("does not allow leaving terminal states except into refunds", () => {
    expect(nextStatuses("REFUNDED", "SUPER_ADMIN")).toEqual([]);
    expect(nextStatuses("CANCELLED", "SYSTEM")).toEqual(["REFUND_PENDING"]);
  });

  it("supports shipment exception rollback and courier reassignment", () => {
    expect(canTransition("SHIPMENT_CREATING", "PACKED", "SYSTEM")).toBe(true);
    expect(canTransition("COURIER_ASSIGNED", "PACKED", "SYSTEM")).toBe(true);
  });

  it("exposes one forward button per shop step", () => {
    expect(SHOP_FORWARD_ACTION.SHOP_PENDING?.label).toBe("Accept Order");
    expect(SHOP_FORWARD_ACTION.READY_FOR_PACKING?.label).toBe("Order Packed");
    expect(SHOP_FORWARD_ACTION.PACKED).toBeUndefined();
  });
});
