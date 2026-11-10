import { z } from "zod";
import { api } from "@/server/http";
import { badRequest } from "@/server/errors";
import { browseProducts } from "@/server/services/catalog";
import { readLocationCookie } from "@/server/services/location";

export const GET = api(
  {
    query: z.object({
      q: z.string().max(80).optional(),
      categoryId: z.string().optional(),
      subcategoryId: z.string().optional(),
      shopId: z.string().optional(),
      sort: z.enum(["relevance", "price_asc", "price_desc", "discount", "newest", "eta"]).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(60).default(24),
      lat: z.coerce.number().optional(),
      lng: z.coerce.number().optional(),
    }),
    rateLimit: { name: "browse", limit: 120 },
  },
  async ({ query }) => {
    const loc = query.lat != null && query.lng != null ? { lat: query.lat, lng: query.lng } : await readLocationCookie();
    if (!loc) throw badRequest("Set your delivery location first");
    const { shops, ...res } = await browseProducts({ lat: loc.lat, lng: loc.lng }, query);
    return { ...res, shopCount: shops.length };
  },
);
