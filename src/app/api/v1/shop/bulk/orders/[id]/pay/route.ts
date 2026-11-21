import { api } from "@/server/http";
import { startBulkPayment } from "@/server/services/bulk";

export const POST = api({ roles: ["SHOP_OWNER"], rateLimit: { name: "bulk-pay", limit: 20 } }, async ({ user, params }) => startBulkPayment(user, params.id));
