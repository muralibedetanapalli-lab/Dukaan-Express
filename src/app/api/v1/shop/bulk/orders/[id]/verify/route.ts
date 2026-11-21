import { z } from "zod";
import { api } from "@/server/http";
import { verifyBulkPayment } from "@/server/services/bulk";

/** The browser reports checkout closed; the real status always comes from Cashfree (or the sandbox). */
export const POST = api(
  {
    roles: ["SHOP_OWNER"],
    rateLimit: { name: "bulk-verify", limit: 30 },
    body: z.object({
      orderId: z.string().optional(),
      gatewayOrderId: z.string().max(60).optional(),
      sandboxOutcome: z.enum(["success", "failure"]).optional(),
    }),
  },
  async ({ user, params, body }) => verifyBulkPayment(user, params.id, body),
);
