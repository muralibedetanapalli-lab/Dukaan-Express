import { z } from "zod";
import { api } from "@/server/http";
import { availableCoupons } from "@/server/services/coupon";

export const GET = api({ query: z.object({ shopId: z.string().optional() }) }, async ({ query }) => ({
  coupons: (await availableCoupons(query.shopId ?? null)).map((c) => ({
    code: c.code,
    description: c.description,
    type: c.type,
    value: c.value,
    maxDiscount: c.maxDiscount,
    minOrderAmount: c.minOrderAmount,
    firstOrderOnly: c.firstOrderOnly,
    shopId: c.shopId,
  })),
}));
