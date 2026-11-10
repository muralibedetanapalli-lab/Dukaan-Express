import { api } from "@/server/http";
import { upsertSubcategory, zSubcategoryInput } from "@/server/services/admin";

export const POST = api({ roles: ["SUPER_ADMIN"], body: zSubcategoryInput }, async ({ user, body }) => upsertSubcategory(user, null, body));
