import { api } from "@/server/http";
import { setBulkPrices, zBulkPrices } from "@/server/services/bulk";

/** Bulk price and minimum quantity per product (null price = not sold in bulk). */
export const POST = api({ roles: ["SHOP_OWNER"], body: zBulkPrices }, async ({ user, body }) => setBulkPrices(user, body));
