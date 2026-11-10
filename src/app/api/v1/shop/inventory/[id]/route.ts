import { api } from "@/server/http";
import { db } from "@/server/db";
import { notFound } from "@/server/errors";
import { activeShopFor, removeInventory, updateInventory, zInventoryPatch } from "@/server/services/inventory";

export const GET = api({ roles: ["SHOP_OWNER"] }, async ({ user, params }) => {
  const { shop } = await activeShopFor(user);
  const item = await db.shopInventory.findFirst({
    where: { id: params.id, shopId: shop.id, deletedAt: null },
    include: { product: { include: { images: { orderBy: { sortOrder: "asc" } }, category: true, subcategory: true } }, variant: true },
  });
  if (!item) throw notFound("Inventory item");
  return { item, canEditProduct: item.product.createdByShopId === shop.id };
});

export const PATCH = api({ roles: ["SHOP_OWNER"], body: zInventoryPatch }, async ({ user, params, body }) => {
  const { shop } = await activeShopFor(user);
  return updateInventory(shop.id, params.id, user, body);
});

export const DELETE = api({ roles: ["SHOP_OWNER"] }, async ({ user, params }) => {
  const { shop } = await activeShopFor(user);
  await removeInventory(shop.id, params.id, user);
  return { ok: true };
});
