import { api } from "@/server/http";
import { reorder } from "@/server/services/order";

export const POST = api({ roles: ["CUSTOMER"] }, async ({ user, params }) =>
  reorder(params.id, { id: user.id, role: "CUSTOMER", customerId: user.customerId }),
);
