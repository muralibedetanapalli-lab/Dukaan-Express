import { z } from "zod";
import { api } from "@/server/http";
import { db } from "@/server/db";

export const GET = api(
  { roles: ["SUPER_ADMIN"], query: z.object({ provider: z.enum(["CASHFREE", "SHIPROCKET"]).optional() }) },
  async ({ query }) => ({
    events: await db.webhookEvent.findMany({
      where: query.provider ? { provider: query.provider } : {},
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  }),
);
