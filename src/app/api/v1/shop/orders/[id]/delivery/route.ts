import { z } from "zod";
import { api } from "@/server/http";
import { completeDelivery, dispatchOwn, failDelivery } from "@/server/services/delivery";

/** Shop's own delivery: send out, complete with the customer's code, or report a failed attempt. */
export const POST = api(
  {
    roles: ["SHOP_OWNER"],
    body: z.discriminatedUnion("action", [
      z.object({ action: z.literal("deliver_own") }),
      z.object({ action: z.literal("delivery_complete"), code: z.string().trim().regex(/^\d{4}$/, "Enter the 4-digit code") }),
      z.object({ action: z.literal("delivery_failed"), reason: z.string().trim().min(3).max(300) }),
    ]),
    rateLimit: { name: "shop-delivery", limit: 30 },
  },
  async ({ user, params, body }) => {
    if (body.action === "deliver_own") await dispatchOwn(user, params.id);
    else if (body.action === "delivery_complete") await completeDelivery(user, params.id, body.code);
    else await failDelivery(user, params.id, body.reason);
    return { ok: true };
  },
);
