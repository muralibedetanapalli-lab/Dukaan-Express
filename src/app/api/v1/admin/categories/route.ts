import { api } from "@/server/http";
import { db } from "@/server/db";
import { upsertCategory, zCategoryInput } from "@/server/services/admin";

export const GET = api({ roles: ["SUPER_ADMIN", "SHOP_OWNER"] }, async () => ({
  categories: await db.category.findMany({
    where: { deletedAt: null },
    orderBy: { sortOrder: "asc" },
    include: { subcategories: { orderBy: { sortOrder: "asc" } }, _count: { select: { products: true } } },
  }),
}));

export const POST = api({ roles: ["SUPER_ADMIN"], body: zCategoryInput }, async ({ user, body }) => upsertCategory(user, null, body));
