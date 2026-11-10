import { api } from "@/server/http";
import { getOrderForActor } from "@/server/services/order";
import { nextStatuses, SHOP_FORWARD_ACTION } from "@/server/services/order-state";
import type { OrderStatusKey } from "@/lib/order-status";

export const GET = api({ roles: ["SHOP_OWNER"] }, async ({ user, params }) => {
  const order = await getOrderForActor(params.id, { id: user.id, role: "SHOP_OWNER", shopOwnerId: user.shopOwnerId });
  const status = order.status as OrderStatusKey;
  return {
    order: { ...order, customer: { user: { name: order.customer.user.name } } },
    actions: {
      forward: SHOP_FORWARD_ACTION[status] ?? null,
      canReject: nextStatuses(status, "SHOP_OWNER").includes("SHOP_REJECTED"),
      canRequestModification: ["SHOP_ACCEPTED", "PREPARING", "READY_FOR_PACKING"].includes(status),
      canRetryShipment: status === "PACKED",
    },
  };
});
