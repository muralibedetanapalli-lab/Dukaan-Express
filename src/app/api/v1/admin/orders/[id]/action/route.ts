import { z } from "zod";
import { api } from "@/server/http";
import { ORDER_STATUSES } from "@/lib/order-status";
import { adminCancel, transitionOrder } from "@/server/services/order";
import { initiateRefund } from "@/server/services/payment";
import { cancelShipment, courierOptions, createShipmentForOrder, refreshTracking, simulateNextCourierEvent } from "@/server/services/shipment";

/** Admin order operations: override transitions, cancel, refund, and shipment management. */
export const POST = api(
  {
    roles: ["SUPER_ADMIN"],
    body: z.discriminatedUnion("action", [
      z.object({ action: z.literal("transition"), to: z.enum(ORDER_STATUSES), remarks: z.string().trim().min(3).max(300) }),
      z.object({ action: z.literal("cancel"), reason: z.string().trim().min(3).max(300) }),
      z.object({ action: z.literal("refund"), amount: z.number().int().min(1), reason: z.string().trim().min(3).max(300) }),
      z.object({ action: z.literal("shipment_create"), courierCompanyId: z.number().int().optional() }),
      z.object({ action: z.literal("shipment_cancel") }),
      z.object({ action: z.literal("shipment_refresh") }),
      z.object({ action: z.literal("shipment_couriers") }),
      z.object({ action: z.literal("simulate_courier") }),
    ]),
  },
  async ({ user, params, body }) => {
    const actor = { id: user.id, role: "SUPER_ADMIN" as const };
    switch (body.action) {
      case "transition":
        return transitionOrder(params.id, body.to, actor, { remarks: `Admin override: ${body.remarks}` });
      case "cancel":
        return adminCancel(params.id, actor, body.reason);
      case "refund":
        return initiateRefund(params.id, { amount: body.amount, reason: body.reason, actor });
      case "shipment_create":
        return createShipmentForOrder(params.id, actor, { courierCompanyId: body.courierCompanyId });
      case "shipment_cancel":
        await cancelShipment(params.id, actor);
        return { ok: true };
      case "shipment_refresh":
        return refreshTracking(params.id);
      case "shipment_couriers":
        return { couriers: await courierOptions(params.id) };
      case "simulate_courier":
        return simulateNextCourierEvent(params.id);
    }
  },
);
