import { z } from "zod";
import { api } from "@/server/http";
import { buyerBulkAction, sellerBulkAction } from "@/server/services/bulk";

const reason = z.string().trim().min(3).max(300);

export const POST = api(
  {
    roles: ["SHOP_OWNER"],
    body: z.discriminatedUnion("action", [
      z.object({ action: z.literal("accept") }),
      z.object({ action: z.literal("reject"), reason }),
      z.object({ action: z.literal("dispatch") }),
      z.object({ action: z.literal("ready") }),
      z.object({ action: z.literal("delivered") }),
      z.object({ action: z.literal("cancel"), reason: reason.optional(), as: z.enum(["buyer", "seller"]) }),
      z.object({ action: z.literal("received") }),
    ]),
  },
  async ({ user, params, body }) => {
    if (body.action === "received") return buyerBulkAction(user, params.id, { action: "received" });
    if (body.action === "cancel") {
      return body.as === "buyer"
        ? buyerBulkAction(user, params.id, { action: "cancel", reason: body.reason })
        : sellerBulkAction(user, params.id, { action: "cancel", reason: body.reason ?? "Seller couldn't fulfil the order" });
    }
    return sellerBulkAction(user, params.id, body);
  },
);
