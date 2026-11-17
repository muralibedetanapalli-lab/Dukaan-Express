import { api } from "@/server/http";
import { getOrderForActor } from "@/server/services/order";
import { trackingFor } from "@/server/services/delivery";

/** Live delivery tracking for the customer: status, handover code, rider and their latest position. */
export const GET = api({ roles: ["CUSTOMER"] }, async ({ user, params }) => {
  const order = await getOrderForActor(params.id, { id: user.id, role: "CUSTOMER", customerId: user.customerId });
  return { status: order.status, tracking: await trackingFor(order) };
});
