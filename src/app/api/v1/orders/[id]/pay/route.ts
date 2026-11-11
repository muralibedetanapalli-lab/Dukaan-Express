import { api } from "@/server/http";
import { startPayment } from "@/server/services/payment";

/** Create (or reuse) the Cashfree order for a PAYMENT_PENDING order and return checkout options. */
export const POST = api({ roles: ["CUSTOMER"], rateLimit: { name: "pay", limit: 20 } }, async ({ user, params }) =>
  startPayment(params.id, user.customerId!),
);
