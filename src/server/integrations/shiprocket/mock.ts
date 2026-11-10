import "server-only";
import { randomInt } from "node:crypto";
import type {
  AwbResult,
  CourierOption,
  CreateOrderInput,
  CreatedOrder,
  PickupLocationInput,
  ServiceabilityInput,
  ShippingProvider,
  TrackingResult,
} from "./types";
import { ShiprocketError } from "./types";

/**
 * Isolated sandbox adapter used when Shiprocket credentials are absent.
 * It is NOT Shiprocket: every id it issues is prefixed MOCK- and the UI shows a sandbox badge.
 *
 * Test hooks:
 *  - delivery pincode ending in "999" → no couriers (exercise the exception flow)
 *  - delivery pincode ending in "998" → order creation fails once with a timeout
 *    (exercise idempotent retry: the order is created on the "server" but the response is lost)
 */
interface MockOrder {
  channelOrderId: string;
  shiprocketOrderId: string;
  shipmentId: string;
  awbCode: string | null;
  cancelled: boolean;
}

const g = globalThis as unknown as { __srMock?: { orders: Map<string, MockOrder>; timeoutsServed: Set<string> } };
const state = (g.__srMock ??= { orders: new Map(), timeoutsServed: new Set() });

const COURIERS = [
  { id: 901, name: "Mock Hyperlocal Express (bike)", base: 3500, perKg: 500, hours: 1, rating: 4.6 },
  { id: 902, name: "Mock QuickDrop 2-hour", base: 2800, perKg: 400, hours: 2, rating: 4.2 },
  { id: 903, name: "Mock Standard Surface", base: 1800, perKg: 300, hours: 24, rating: 3.9 },
];

export class ShiprocketMock implements ShippingProvider {
  readonly name = "SHIPROCKET_MOCK" as const;

  async checkServiceability(input: ServiceabilityInput): Promise<CourierOption[]> {
    if (input.deliveryPincode.endsWith("999")) return [];
    return COURIERS.map((c, i) => ({
      courierCompanyId: c.id,
      courierName: c.name,
      rate: c.base + Math.ceil(input.weightKg) * c.perKg,
      etd: c.hours < 24 ? `Within ${c.hours} hour${c.hours > 1 ? "s" : ""}` : "Next day",
      etdHours: c.hours,
      rating: c.rating,
      isSurface: c.hours >= 24,
      recommended: i === 0,
    }));
  }

  async findOrderByChannelId(channelOrderId: string) {
    const o = state.orders.get(channelOrderId);
    return o && !o.cancelled ? { shiprocketOrderId: o.shiprocketOrderId, shipmentId: o.shipmentId, awbCode: o.awbCode } : null;
  }

  async createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
    const existing = state.orders.get(input.channelOrderId);
    const order: MockOrder =
      existing && !existing.cancelled
        ? existing
        : {
            channelOrderId: input.channelOrderId,
            shiprocketOrderId: `MOCK-ORD-${randomInt(10_000_000, 99_999_999)}`,
            shipmentId: `MOCK-SHP-${randomInt(10_000_000, 99_999_999)}`,
            awbCode: null,
            cancelled: false,
          };
    state.orders.set(input.channelOrderId, order);
    if (input.address.pincode.endsWith("998") && !state.timeoutsServed.has(input.channelOrderId)) {
      state.timeoutsServed.add(input.channelOrderId);
      throw new ShiprocketError("Shiprocket unreachable: request timed out (simulated)", null, null, true);
    }
    return { shiprocketOrderId: order.shiprocketOrderId, shipmentId: order.shipmentId };
  }

  async assignAwb(shipmentId: string, courierCompanyId: number): Promise<AwbResult> {
    const order = [...state.orders.values()].find((o) => o.shipmentId === shipmentId);
    const courier = COURIERS.find((c) => c.id === courierCompanyId);
    if (!courier) throw new ShiprocketError("Selected courier is not serviceable", 422, null, false);
    const awb = order?.awbCode ?? `MOCKAWB${randomInt(100_000_000, 999_999_999)}`;
    if (order) order.awbCode = awb;
    return { awbCode: awb, courierCompanyId: courier.id, courierName: courier.name };
  }

  async schedulePickup() {
    return { scheduledAt: new Date(Date.now() + 15 * 60_000), token: `MOCK-PKP-${randomInt(100000, 999999)}` };
  }

  async generateLabel(shipmentId: string) {
    return { labelUrl: `/api/v1/shipments/mock-label/${encodeURIComponent(shipmentId)}` };
  }

  async track(awbCode: string): Promise<TrackingResult> {
    return { currentStatus: "UNKNOWN", etd: null, trackUrl: null, activities: [{ occurredAt: new Date(), status: "AWB Assigned", activity: `Sandbox AWB ${awbCode}`, location: null }] };
  }

  async cancelOrder(shiprocketOrderId: string) {
    for (const o of state.orders.values()) if (o.shiprocketOrderId === shiprocketOrderId) o.cancelled = true;
  }

  async addPickupLocation(input: PickupLocationInput) {
    return { nickname: input.nickname };
  }
}

