import { api } from "@/server/http";
import { getOrderForActor } from "@/server/services/order";
import { nextStatuses } from "@/server/services/order-state";
import type { OrderStatusKey } from "@/lib/order-status";

export const GET = api({ roles: ["SUPER_ADMIN"] }, async ({ user, params }) => {
  const order = await getOrderForActor(params.id, { id: user.id, role: "SUPER_ADMIN" });
  return { order, allowedTransitions: nextStatuses(order.status as OrderStatusKey, "SUPER_ADMIN") };
});
