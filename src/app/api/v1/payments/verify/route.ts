import { z } from "zod";
import { api } from "@/server/http";
import { verifyPayment } from "@/server/services/payment";

export const POST = api(
  {
    roles: ["CUSTOMER"],
    body: z.object({
      orderId: z.string().min(1),
      gatewayOrderId: z.string().min(1).max(45).optional(),
      sandboxOutcome: z.enum(["success", "failure"]).optional(),
    }),
    rateLimit: { name: "pay-verify", limit: 20 },
  },
  async ({ user, body }) => verifyPayment(user.customerId!, body),
);
