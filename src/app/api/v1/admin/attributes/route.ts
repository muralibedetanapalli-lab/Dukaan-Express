import { z } from "zod";
import { api } from "@/server/http";
import { db } from "@/server/db";

export const GET = api({ roles: ["SUPER_ADMIN", "SHOP_OWNER"] }, async () => ({
  attributes: await db.productAttribute.findMany({ orderBy: { name: "asc" } }),
}));

export const POST = api(
  {
    roles: ["SUPER_ADMIN"],
    body: z.object({ name: z.string().trim().min(2).max(40), values: z.array(z.string().trim().min(1).max(40)).max(50) }),
  },
  async ({ body }) =>
    db.productAttribute.upsert({ where: { name: body.name }, create: body, update: { values: body.values } }),
);
