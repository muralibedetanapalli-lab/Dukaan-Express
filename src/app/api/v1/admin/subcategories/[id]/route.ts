import { api } from "@/server/http";
import { upsertSubcategory, zSubcategoryInput } from "@/server/services/admin";

export const PATCH = api({ roles: ["SUPER_ADMIN"], body: zSubcategoryInput }, async ({ user, params, body }) =>
  upsertSubcategory(user, params.id, body),
);
