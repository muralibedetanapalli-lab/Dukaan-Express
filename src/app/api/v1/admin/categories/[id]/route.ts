import { api } from "@/server/http";
import { db } from "@/server/db";
import { conflict } from "@/server/errors";
import { upsertCategory, zCategoryInput } from "@/server/services/admin";
import { audit } from "@/server/services/audit";

export const PATCH = api({ roles: ["SUPER_ADMIN"], body: zCategoryInput }, async ({ user, params, body }) =>
  upsertCategory(user, params.id, body),
);

export const DELETE = api({ roles: ["SUPER_ADMIN"] }, async ({ user, params }) => {
  const products = await db.product.count({ where: { categoryId: params.id, deletedAt: null } });
  if (products) throw conflict(`Category has ${products} products — deactivate it or move products first`);
  await db.category.update({ where: { id: params.id }, data: { deletedAt: new Date(), isActive: false } });
  await audit({ id: user.id, role: user.role }, "category.delete", "Category", params.id);
  return { ok: true };
});
