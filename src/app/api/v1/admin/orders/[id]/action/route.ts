import { z } from "zod";
import { api } from "@/server/http";
import { ORDER_STATUSES } from "@/lib/order-status";
import { adminCancel, transitionOrder } from "@/server/services/order";
import { initiateRefund } from "@/server/services/payment";
import { adminAssignRider, completeDelivery, dispatchOwn, failDelivery, startDelivery } from "@/server/services/delivery";

/** Admin order operations: override transitions, cancel, refund, and delivery management. */
export const POST = api(
  {
    roles: ["SUPER_ADMIN"],
    body: z.discriminatedUnion("action", [
      z.object({ action: z.literal("transition"), to: z.enum(ORDER_STATUSES), remarks: z.string().trim().min(3).max(300) }),
      z.object({ action: z.literal("cancel"), reason: z.string().trim().min(3).max(300) }),
      z.object({ action: z.literal("refund"), amount: z.number().int().min(1), reason: z.string().trim().min(3).max(300) }),
      z.object({ action: z.literal("delivery_start") }),
      z.object({ action: z.literal("assign_rider"), riderId: z.string().min(1) }),
      z.object({ action: z.literal("deliver_own") }),
      z.object({ action: z.literal("delivery_complete"), code: z.string().trim().regex(/^\d{4}$/, "Enter the 4-digit code") }),
      z.object({ action: z.literal("delivery_failed"), reason: z.string().trim().min(3).max(300) }),
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
      case "delivery_start":
        return startDelivery(params.id, actor);
      case "assign_rider":
        await adminAssignRider(user, params.id, body.riderId);
        return { ok: true };
      case "deliver_own":
        await dispatchOwn(user, params.id);
        return { ok: true };
      case "delivery_complete":
        await completeDelivery(user, params.id, body.code);
        return { ok: true };
      case "delivery_failed":
        await failDelivery(user, params.id, body.reason);
        return { ok: true };
    }
  },
);
