import { api } from "@/server/http";
import { getOrderForActor } from "@/server/services/order";

export const GET = api({ roles: ["CUSTOMER"] }, async ({ user, params }) => {
  const order = await getOrderForActor(params.id, { id: user.id, role: "CUSTOMER", customerId: user.customerId });
  // Customers never see internal commission figures.
  const { commissionAmount, commissionBps, shopEarning, ...safe } = order;
  void commissionAmount;
  void commissionBps;
  void shopEarning;
  return { order: { ...safe, shipment: safe.shipment ? { ...safe.shipment, lastError: null, freightCharge: null } : null } };
});
