import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/server/db";
import { badRequest, conflict, forbidden, notFound } from "@/server/errors";
import type { SessionUser } from "@/server/auth/session";
import { slugify } from "@/lib/format";
import type { Prisma } from "@/generated/prisma/client";
import { getSettings } from "./settings";
import { audit } from "./audit";
import { notifyAdmins } from "./notification";

export const ACTIVE_SHOP_COOKIE = "dx_shop";

/** The shop the current owner is operating. Owners with several shops pick via a cookie. */
export async function activeShopFor(user: SessionUser) {
  if (user.role !== "SHOP_OWNER" || !user.shopOwnerId) throw forbidden();
  const shops = await db.shop.findMany({
    where: { ownerId: user.shopOwnerId, deletedAt: null },
    include: { address: true, hours: { orderBy: { dayOfWeek: "asc" } }, category: true },
    orderBy: { createdAt: "asc" },
  });
  if (!shops.length) throw notFound("Shop assigned to your account");
  const preferred = (await cookies()).get(ACTIVE_SHOP_COOKIE)?.value;
  const shop = shops.find((s) => s.id === preferred) ?? shops[0];
  return { shop, shops };
}

export const zInventoryInput = z.object({
  // Either link an existing master product or create a new one
  productId: z.string().optional().nullable(),
  product: z
    .object({
      name: z.string().trim().min(2).max(120),
      description: z.string().trim().max(2000).optional().nullable(),
      brand: z.string().trim().max(60).optional().nullable(),
      categoryId: z.string().min(1),
      subcategoryId: z.string().optional().nullable(),
      sku: z.string().trim().max(60).optional().nullable(),
      barcode: z.string().trim().max(60).optional().nullable(),
      unit: z.enum(["pcs", "g", "kg", "ml", "l", "pack", "dozen"]),
      unitValue: z.number().positive().max(100000).optional().nullable(),
      weightGrams: z.number().int().min(1).max(50000),
      lengthCm: z.number().min(1).max(200),
      breadthCm: z.number().min(1).max(200),
      heightCm: z.number().min(1).max(200),
      images: z.array(z.string().max(500)).max(8).default([]),
    })
    .optional()
    .nullable(),
  variantName: z.string().trim().max(40).optional().nullable(),
  shopSku: z.string().trim().max(60).optional().nullable(),
  mrp: z.number().int().min(100).max(10_000_000),
  sellingPrice: z.number().int().min(100).max(10_000_000),
  stock: z.number().int().min(0).max(100000),
  lowStockThreshold: z.number().int().min(0).max(10000).default(5),
  maxPerOrder: z.number().int().min(1).max(100).default(10),
  isAvailable: z.boolean().default(true),
});
export type InventoryInput = z.infer<typeof zInventoryInput>;

async function uniqueSlug(name: string) {
  const base = slugify(name) || "product";
  let slug = base;
  for (let i = 2; await db.product.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
  return slug;
}

export async function createInventory(shopId: string, actor: SessionUser, input: InventoryInput) {
  if (input.sellingPrice > input.mrp) throw badRequest("Selling price cannot exceed MRP");
  const settings = await getSettings();
  let productId = input.productId ?? null;

  if (!productId) {
    if (!input.product) throw badRequest("Choose an existing product or enter new product details");
    const p = input.product;
    const cat = await db.category.findFirst({ where: { id: p.categoryId, isActive: true, deletedAt: null } });
    if (!cat) throw badRequest("Invalid category");
    if (p.subcategoryId) {
      const sub = await db.subcategory.findFirst({ where: { id: p.subcategoryId, categoryId: p.categoryId } });
      if (!sub) throw badRequest("Invalid subcategory");
    }
    const created = await db.product.create({
      data: {
        name: p.name,
        slug: await uniqueSlug(p.name),
        description: p.description ?? null,
        brand: p.brand ?? null,
        categoryId: p.categoryId,
        subcategoryId: p.subcategoryId ?? null,
        sku: p.sku || null,
        barcode: p.barcode || null,
        unit: p.unit,
        unitValue: p.unitValue ?? null,
        weightGrams: p.weightGrams,
        lengthCm: p.lengthCm,
        breadthCm: p.breadthCm,
        heightCm: p.heightCm,
        createdByShopId: shopId,
        approvalStatus: settings.approvals.productApprovalRequired ? "PENDING" : "APPROVED",
        images: { create: p.images.map((url, i) => ({ url, sortOrder: i })) },
      },
    });
    productId = created.id;
    if (created.approvalStatus === "PENDING") {
      await notifyAdmins({ type: "SHOP", title: "Product awaiting approval", body: created.name, link: "/admin/products?approval=PENDING" });
    }
  } else {
    const exists = await db.product.findFirst({ where: { id: productId, deletedAt: null } });
    if (!exists) throw notFound("Product");
  }

  let variantId: string | null = null;
  if (input.variantName) {
    const v = await db.productVariant.upsert({
      where: { productId_name: { productId, name: input.variantName } },
      create: { productId, name: input.variantName },
      update: {},
    });
    variantId = v.id;
  }
  const variantKey = variantId ?? "";
  const dup = await db.shopInventory.findUnique({ where: { shopId_productId_variantKey: { shopId, productId, variantKey } } });
  if (dup && !dup.deletedAt) throw conflict("This product is already in your inventory — edit it instead");

  const data = {
    shopSku: input.shopSku ?? null,
    mrp: input.mrp,
    sellingPrice: input.sellingPrice,
    stock: input.stock,
    lowStockThreshold: input.lowStockThreshold,
    maxPerOrder: input.maxPerOrder,
    isAvailable: input.isAvailable,
    deletedAt: null,
  };
  const inv = dup
    ? await db.shopInventory.update({ where: { id: dup.id }, data })
    : await db.shopInventory.create({ data: { shopId, productId, variantId, variantKey, ...data } });
  await audit({ id: actor.id, role: actor.role }, "inventory.create", "ShopInventory", inv.id, { after: data });
  return inv;
}

export const zInventoryPatch = z.object({
  mrp: z.number().int().min(100).max(10_000_000).optional(),
  sellingPrice: z.number().int().min(100).max(10_000_000).optional(),
  stock: z.number().int().min(0).max(100000).optional(),
  stockDelta: z.number().int().min(-100000).max(100000).optional(),
  lowStockThreshold: z.number().int().min(0).max(10000).optional(),
  maxPerOrder: z.number().int().min(1).max(100).optional(),
  isAvailable: z.boolean().optional(),
  shopSku: z.string().trim().max(60).optional().nullable(),
  product: z
    .object({
      name: z.string().trim().min(2).max(120).optional(),
      description: z.string().trim().max(2000).optional().nullable(),
      brand: z.string().trim().max(60).optional().nullable(),
      subcategoryId: z.string().optional().nullable(),
      barcode: z.string().trim().max(60).optional().nullable(),
      weightGrams: z.number().int().min(1).max(50000).optional(),
      lengthCm: z.number().min(1).max(200).optional(),
      breadthCm: z.number().min(1).max(200).optional(),
      heightCm: z.number().min(1).max(200).optional(),
      images: z.array(z.string().max(500)).max(8).optional(),
    })
    .optional(),
});

export async function updateInventory(shopId: string, inventoryId: string, actor: SessionUser, patch: z.infer<typeof zInventoryPatch>) {
  const inv = await db.shopInventory.findFirst({ where: { id: inventoryId, shopId, deletedAt: null }, include: { product: true } });
  if (!inv) throw notFound("Inventory item");
  const mrp = patch.mrp ?? inv.mrp;
  const price = patch.sellingPrice ?? inv.sellingPrice;
  if (price > mrp) throw badRequest("Selling price cannot exceed MRP");

  const data: Prisma.ShopInventoryUpdateInput = {
    mrp: patch.mrp,
    sellingPrice: patch.sellingPrice,
    lowStockThreshold: patch.lowStockThreshold,
    maxPerOrder: patch.maxPerOrder,
    isAvailable: patch.isAvailable,
    shopSku: patch.shopSku,
  };
  if (patch.stock != null) data.stock = patch.stock;
  else if (patch.stockDelta) {
    if (inv.stock + patch.stockDelta < 0) throw badRequest("Stock cannot go below zero");
    data.stock = { increment: patch.stockDelta };
  }
  const updated = await db.shopInventory.update({ where: { id: inv.id }, data });

  // Shops may edit master product details only for products they created.
  if (patch.product && inv.product.createdByShopId === shopId) {
    const { images, ...rest } = patch.product;
    await db.product.update({ where: { id: inv.productId }, data: rest });
    if (images) {
      await db.$transaction([
        db.productImage.deleteMany({ where: { productId: inv.productId } }),
        db.productImage.createMany({ data: images.map((url, i) => ({ productId: inv.productId, url, sortOrder: i })) }),
      ]);
    }
  } else if (patch.product && Object.keys(patch.product).length) {
    throw forbidden("Only the shop that created this product (or an admin) can edit its master details");
  }
  await audit({ id: actor.id, role: actor.role }, "inventory.update", "ShopInventory", inv.id, {
    before: { mrp: inv.mrp, sellingPrice: inv.sellingPrice, stock: inv.stock, isAvailable: inv.isAvailable },
    after: { mrp: updated.mrp, sellingPrice: updated.sellingPrice, stock: updated.stock, isAvailable: updated.isAvailable },
  });
  return updated;
}

export async function removeInventory(shopId: string, inventoryId: string, actor: SessionUser) {
  const inv = await db.shopInventory.findFirst({ where: { id: inventoryId, shopId, deletedAt: null } });
  if (!inv) throw notFound("Inventory item");
  await db.shopInventory.update({ where: { id: inv.id }, data: { deletedAt: new Date(), isAvailable: false } });
  await db.cartItem.deleteMany({ where: { inventoryId: inv.id } });
  await audit({ id: actor.id, role: actor.role }, "inventory.delete", "ShopInventory", inv.id);
}

export async function listInventory(
  shopId: string,
  q: { search?: string; filter?: "all" | "low" | "out" | "unavailable"; categoryId?: string; page: number; pageSize: number },
) {
  const where: Prisma.ShopInventoryWhereInput = {
    shopId,
    deletedAt: null,
    ...(q.categoryId ? { product: { categoryId: q.categoryId } } : {}),
    ...(q.search
      ? {
          OR: [
            { product: { name: { contains: q.search, mode: "insensitive" } } },
            { product: { sku: { contains: q.search, mode: "insensitive" } } },
            { shopSku: { contains: q.search, mode: "insensitive" } },
            { product: { barcode: q.search } },
          ],
        }
      : {}),
    ...(q.filter === "out" ? { stock: 0 } : {}),
    ...(q.filter === "unavailable" ? { isAvailable: false } : {}),
  };
  let rows = await db.shopInventory.findMany({
    where,
    include: {
      product: { include: { images: { orderBy: { sortOrder: "asc" }, take: 1 }, category: true, subcategory: true } },
      variant: true,
    },
    orderBy: [{ updatedAt: "desc" }],
  });
  if (q.filter === "low") rows = rows.filter((r) => r.stock <= r.lowStockThreshold);
  const total = rows.length;
  return { items: rows.slice((q.page - 1) * q.pageSize, q.page * q.pageSize), total, page: q.page, pageSize: q.pageSize };
}

/** Search the global catalogue so shops can list an existing product instead of duplicating it. */
export async function searchMasterProducts(query: string) {
  if (query.trim().length < 2) return [];
  return db.product.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { brand: { contains: query, mode: "insensitive" } },
        { barcode: query },
        { sku: query },
      ],
    },
    include: { images: { take: 1, orderBy: { sortOrder: "asc" } }, category: true },
    take: 15,
  });
}
