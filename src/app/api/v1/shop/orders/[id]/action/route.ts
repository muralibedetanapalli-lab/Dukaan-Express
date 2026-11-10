import { z } from "zod";
import { api } from "@/server/http";
import { badRequest } from "@/server/errors";
import { getOrderForActor, shopReject, transitionOrder } from "@/server/services/order";
import { createShipmentForOrder } from "@/server/services/shipment";

const ACTION_TO_STATUS = {
  accept: "SHOP_ACCEPTED",
  start_preparing: "PREPARING",
  ready_for_packing: "READY_FOR_PACKING",
  packed: "PACKED",
} as const;

/**
 * Shop workflow buttons: Accept Order, Reject Order, Start Preparing, Ready for Packing, Order Packed.
 * "packed" also kicks off the Shiprocket shipment workflow.
 */
export const POST = api(
  {
    roles: ["SHOP_OWNER"],
    body: z.object({
      action: z.enum(["accept", "reject", "start_preparing", "ready_for_packing", "packed"]),
      reason: z.string().trim().max(200).optional(),
    }),
    rateLimit: { name: "shop-action", limit: 60 },
  },
  async ({ user, params, body }) => {
    const actor = { id: user.id, role: "SHOP_OWNER" as const, shopOwnerId: user.shopOwnerId };
    if (body.action === "reject") {
      if (!body.reason || body.reason.length < 3) throw badRequest("Please give a reason for rejecting");
      await shopReject(params.id, actor, body.reason);
      return { status: "SHOP_REJECTED" };
    }
    await transitionOrder(params.id, ACTION_TO_STATUS[body.action], actor, { remarks: body.reason ?? null });
    if (body.action === "packed") {
      const shipment = await createShipmentForOrder(params.id, actor);
      const order = await getOrderForActor(params.id, actor);
      return { status: order.status, shipment: { ok: shipment.ok, error: shipment.ok ? null : shipment.error } };
    }
    return { status: ACTION_TO_STATUS[body.action] };
  },
);
