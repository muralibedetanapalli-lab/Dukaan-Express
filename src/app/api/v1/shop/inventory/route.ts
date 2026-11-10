import { z } from "zod";
import { api } from "@/server/http";
import { activeShopFor, createInventory, listInventory, zInventoryInput } from "@/server/services/inventory";

export const GET = api(
  {
    roles: ["SHOP_OWNER"],
    query: z.object({
      search: z.string().max(80).optional(),
      filter: z.enum(["all", "low", "out", "unavailable"]).default("all"),
      categoryId: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(200).default(50),
    }),
  },
  async ({ user, query }) => {
    const { shop } = await activeShopFor(user);
    return listInventory(shop.id, query);
  },
);

export const POST = api({ roles: ["SHOP_OWNER"], body: zInventoryInput }, async ({ user, body }) => {
  const { shop } = await activeShopFor(user);
  return createInventory(shop.id, user, body);
});
