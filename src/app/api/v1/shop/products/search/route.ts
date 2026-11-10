import { z } from "zod";
import { api } from "@/server/http";
import { searchMasterProducts } from "@/server/services/inventory";

export const GET = api(
  { roles: ["SHOP_OWNER", "SUPER_ADMIN"], query: z.object({ q: z.string().max(80).default("") }) },
  async ({ query }) => ({ products: await searchMasterProducts(query.q) }),
);
