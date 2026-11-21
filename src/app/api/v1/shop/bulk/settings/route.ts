import { api } from "@/server/http";
import { updateBulkSettings, zBulkSettings } from "@/server/services/bulk";

/** Wholesale on/off, minimum order, delivery / pickup and payment options. */
export const PATCH = api({ roles: ["SHOP_OWNER"], body: zBulkSettings }, async ({ user, body }) => updateBulkSettings(user, body));
