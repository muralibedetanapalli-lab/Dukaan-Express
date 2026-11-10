import { z } from "zod";
import { api } from "@/server/http";
import { verifyPayment } from "@/server/services/payment";

export const POST = api(
  {
    roles: ["CUSTOMER"],
    body: z.object({
      orderId: z.string().min(1),
      razorpayOrderId: z.string().min(1),
      razorpayPaymentId: z.string().optional(),
      razorpaySignature: z.string().optional(),
      sandboxOutcome: z.enum(["success", "failure"]).optional(),
    }),
    rateLimit: { name: "pay-verify", limit: 20 },
  },
  async ({ user, body }) => verifyPayment(user.customerId!, body),
);
