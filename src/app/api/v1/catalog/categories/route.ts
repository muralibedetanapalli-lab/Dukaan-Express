import { api } from "@/server/http";
import { db } from "@/server/db";

export const GET = api({}, async () => ({
  categories: await db.category.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { sortOrder: "asc" },
    include: { subcategories: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } },
  }),
}));
