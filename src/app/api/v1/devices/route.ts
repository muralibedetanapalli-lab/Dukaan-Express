import { z } from "zod";
import { api } from "@/server/http";
import { db } from "@/server/db";

/** Register an FCM device token for push notifications. */
export const POST = api(
  {
    roles: ["CUSTOMER", "SHOP_OWNER", "SUPER_ADMIN"],
    body: z.object({ token: z.string().min(20).max(4096), platform: z.enum(["web", "android", "ios"]).default("web") }),
  },
  async ({ user, body }) =>
    db.deviceToken.upsert({
      where: { token: body.token },
      create: { token: body.token, platform: body.platform, userId: user.id },
      update: { userId: user.id, platform: body.platform },
    }),
);

export const DELETE = api(
  { roles: ["CUSTOMER", "SHOP_OWNER", "SUPER_ADMIN"], body: z.object({ token: z.string().min(20).max(4096) }) },
  async ({ user, body }) => {
    await db.deviceToken.deleteMany({ where: { token: body.token, userId: user.id } });
    return { ok: true };
  },
);
