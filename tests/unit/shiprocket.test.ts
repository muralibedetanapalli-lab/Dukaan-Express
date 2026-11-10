import { describe, expect, it } from "vitest";
import { mapShiprocketStatus } from "@/server/integrations/shiprocket";
import { chooseCourier } from "@/server/services/shipment";
import type { CourierOption } from "@/server/integrations/shiprocket/types";

describe("Shiprocket status mapping", () => {
  it.each([
    ["DELIVERED", null, "DELIVERED"],
    ["Out For Delivery", null, "OUT_FOR_DELIVERY"],
    ["PICKED UP", null, "PICKED_UP"],
    ["Shipped", null, "PICKED_UP"],
    ["IN TRANSIT", null, "IN_TRANSIT"],
    ["OUT FOR PICKUP", null, "PICKUP_SCHEDULED"],
    ["UNDELIVERED", null, "FAILED_ATTEMPT"],
    ["RTO INITIATED", null, "RTO"],
    ["CANCELED", null, "CANCELLED"],
    ["Pickup Exception", null, "EXCEPTION"],
    ["something-new", 7, "DELIVERED"],
    ["something-new", 17, "OUT_FOR_DELIVERY"],
    ["unknown", null, null],
  ])("%s (%s) → %s", (label, id, expected) => {
    expect(mapShiprocketStatus(label, id)).toBe(expected);
  });
});

describe("courier selection", () => {
  const opts: CourierOption[] = [
    { courierCompanyId: 1, courierName: "Slow cheap", rate: 1000, etd: null, etdHours: 48, rating: 3, isSurface: true, recommended: false },
    { courierCompanyId: 2, courierName: "Fast", rate: 4000, etd: null, etdHours: 1, rating: 4, isSurface: false, recommended: false },
    { courierCompanyId: 3, courierName: "Recommended", rate: 2500, etd: null, etdHours: 3, rating: 5, isSurface: false, recommended: true },
  ];
  it("picks by strategy", () => {
    expect(chooseCourier(opts, "FASTEST")?.courierCompanyId).toBe(2);
    expect(chooseCourier(opts, "CHEAPEST")?.courierCompanyId).toBe(1);
    expect(chooseCourier(opts, "RECOMMENDED")?.courierCompanyId).toBe(3);
  });
  it("returns null when nothing is serviceable", () => {
    expect(chooseCourier([], "FASTEST")).toBeNull();
  });
});
