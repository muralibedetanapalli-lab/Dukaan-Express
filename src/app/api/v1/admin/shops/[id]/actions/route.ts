import { z } from "zod";
import { api } from "@/server/http";
import { assignOwner, setShopActive, setShopApproval } from "@/server/services/admin";

export const POST = api(
  {
    roles: ["SUPER_ADMIN"],
    body: z.discriminatedUnion("action", [
      z.object({ action: z.literal("approve") }),
      z.object({ action: z.literal("reject"), reason: z.string().trim().min(3).max(300) }),
      z.object({ action: z.literal("activate") }),
      z.object({ action: z.literal("deactivate") }),
      z.object({ action: z.literal("assign_owner"), ownerId: z.string().nullable() }),
    ]),
  },
  async ({ user, params, body }) => {
    switch (body.action) {
      case "approve":
        return setShopApproval(user, params.id, true);
      case "reject":
        return setShopApproval(user, params.id, false, body.reason);
      case "activate":
        return setShopActive(user, params.id, true);
      case "deactivate":
        return setShopActive(user, params.id, false);
      case "assign_owner":
        return assignOwner(user, params.id, body.ownerId);
    }
  },
);
