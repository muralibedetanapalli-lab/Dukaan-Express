import { z } from "zod";
import { api } from "@/server/http";
import { getOrderForActor } from "@/server/services/order";
import { cancelShipment, courierOptions, createShipmentForOrder, refreshTracking, simulateNextCourierEvent } from "@/server/services/shipment";

/** Courier options for the order (serviceability check). */
export const GET = api({ roles: ["SHOP_OWNER"] }, async ({ user, params }) => {
  await getOrderForActor(params.id, { id: user.id, role: "SHOP_OWNER", shopOwnerId: user.shopOwnerId });
  return { couriers: await courierOptions(params.id) };
});

export const POST = api(
  {
    roles: ["SHOP_OWNER"],
    body: z.object({
      action: z.enum(["retry", "cancel", "refresh", "simulate"]),
      courierCompanyId: z.number().int().optional(),
    }),
    rateLimit: { name: "shipment", limit: 30 },
  },
  async ({ user, params, body }) => {
    const actor = { id: user.id, role: "SHOP_OWNER" as const, shopOwnerId: user.shopOwnerId };
    await getOrderForActor(params.id, actor);
    switch (body.action) {
      case "retry":
        return createShipmentForOrder(params.id, actor, { courierCompanyId: body.courierCompanyId });
      case "cancel":
        await cancelShipment(params.id, actor);
        return { ok: true };
      case "refresh":
        return refreshTracking(params.id);
      case "simulate":
        return simulateNextCourierEvent(params.id);
    }
  },
);
