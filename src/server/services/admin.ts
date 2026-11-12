import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { badRequest, conflict, notFound } from "@/server/errors";
import { hashPassword, passwordPolicy, temporaryPassword } from "@/server/auth/password";
import type { SessionUser } from "@/server/auth/session";
import { zPhone, zPincode } from "@/server/http";
import { slugify } from "@/lib/format";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "./audit";
import { notifyShop, notifyUsers } from "./notification";

const actorOf = (u: SessionUser) => ({ id: u.id, role: u.role });

// ───────────────────────────── Shops ─────────────────────────────

const zHours = z
  .array(
    z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      openTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      closeTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      isClosed: z.boolean().default(false),
    }),
  )
  .max(7);

export const zShopInput = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional().nullable(),
  categoryId: z.string().optional().nullable(),
  ownerId: z.string().optional().nullable(),
  contactPhone: zPhone,
  contactEmail: z.email().optional().nullable().or(z.literal("").transform(() => null)),
  gstNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "Invalid GSTIN")
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null)),
  logoUrl: z.string().max(500).optional().nullable(),
  coverUrl: z.string().max(500).optional().nullable(),
  images: z.array(z.string().max(500)).max(10).optional(),
  deliveryRadiusKm: z.number().min(0.5).max(50),
  commissionBps: z.number().int().min(0).max(5000).optional().nullable(),
  avgPrepMinutes: z.number().int().min(1).max(120).default(10),
  address: z.object({
    line1: z.string().trim().min(3).max(200),
    line2: z.string().trim().max(200).optional().nullable(),
    landmark: z.string().trim().max(120).optional().nullable(),
    city: z.string().trim().min(2).max(60),
    state: z.string().trim().min(2).max(60),
    pincode: zPincode,
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  hours: zHours.optional(),
});
export type ShopInput = z.infer<typeof zShopInput>;

async function uniqueShopSlug(name: string, excludeId?: string) {
  const base = slugify(name) || "shop";
  let slug = base;
  for (let i = 2; ; i++) {
    const hit = await db.shop.findUnique({ where: { slug } });
    if (!hit || hit.id === excludeId) return slug;
    slug = `${base}-${i}`;
  }
}

const defaultHours = Array.from({ length: 7 }, (_, d) => ({ dayOfWeek: d, openTime: "07:00", closeTime: "23:00", isClosed: false }));

export async function createShop(actor: SessionUser, input: ShopInput, opts: { dealerId?: string; goLive?: boolean } = {}) {
  if (input.ownerId) await assertOwner(input.ownerId);
  const shop = await db.shop.create({
    data: {
      name: input.name,
      slug: await uniqueShopSlug(input.name),
      description: input.description ?? null,
      categoryId: input.categoryId || null,
      ownerId: input.ownerId || null,
      contactPhone: input.contactPhone,
      contactEmail: input.contactEmail ?? null,
      gstNumber: input.gstNumber ?? null,
      logoUrl: input.logoUrl ?? null,
      coverUrl: input.coverUrl ?? null,
      deliveryRadiusKm: input.deliveryRadiusKm,
      commissionBps: input.commissionBps ?? null,
      avgPrepMinutes: input.avgPrepMinutes,
      // Admin-created shops are approved but start inactive until explicitly activated;
      // shops onboarded by a dealer go live straight away.
      approvalStatus: "APPROVED",
      isActive: opts.goLive ?? false,
      dealerId: opts.dealerId ?? null,
      address: { create: input.address },
      hours: { create: input.hours?.length ? input.hours : defaultHours },
      images: input.images ? { create: input.images.map((url, i) => ({ url, sortOrder: i })) } : undefined,
    },
  });
  await audit(actorOf(actor), "shop.create", "Shop", shop.id, { after: input });
  return shop;
}

export async function updateShop(actor: SessionUser, shopId: string, input: Partial<ShopInput>) {
  const before = await db.shop.findUnique({ where: { id: shopId }, include: { address: true } });
  if (!before || before.deletedAt) throw notFound("Shop");
  if (input.ownerId) await assertOwner(input.ownerId);
  const { address, hours, images, ...rest } = input;
  await db.$transaction(async (tx) => {
    await tx.shop.update({
      where: { id: shopId },
      data: {
        ...rest,
        ...(rest.name && rest.name !== before.name ? { slug: await uniqueShopSlug(rest.name, shopId) } : {}),
        ...(rest.categoryId === "" ? { categoryId: null } : {}),
        ...(address &&
        (address.pincode !== before.address?.pincode || address.line1 !== before.address?.line1)
          ? { pickupLocationName: null } // force re-registration of the Shiprocket pickup address
          : {}),
      },
    });
    if (address) await tx.shopAddress.upsert({ where: { shopId }, create: { shopId, ...address }, update: address });
    if (hours) {
      for (const h of hours) {
        await tx.shopOperatingHours.upsert({
          where: { shopId_dayOfWeek: { shopId, dayOfWeek: h.dayOfWeek } },
          create: { shopId, ...h },
          update: h,
        });
      }
    }
    if (images) {
      await tx.shopImage.deleteMany({ where: { shopId } });
      await tx.shopImage.createMany({ data: images.map((url, i) => ({ shopId, url, sortOrder: i })) });
    }
  });
  await audit(actorOf(actor), "shop.update", "Shop", shopId, { before, after: input });
  return db.shop.findUniqueOrThrow({ where: { id: shopId } });
}

export async function setShopApproval(actor: SessionUser, shopId: string, approve: boolean, reason?: string | null) {
  const shop = await db.shop.findUnique({ where: { id: shopId } });
  if (!shop) throw notFound("Shop");
  const updated = await db.shop.update({
    where: { id: shopId },
    data: approve
      ? { approvalStatus: "APPROVED", rejectionReason: null }
      : { approvalStatus: "REJECTED", rejectionReason: reason ?? "Not approved", isActive: false },
  });
  await audit(actorOf(actor), approve ? "shop.approve" : "shop.reject", "Shop", shopId, { after: { reason } });
  await notifyShop(shopId, {
    type: "SHOP",
    title: approve ? "Your shop is approved" : "Shop registration rejected",
    body: approve ? "You can now be activated and start receiving orders." : (reason ?? "Contact support for details."),
    link: "/shop",
  });
  return updated;
}

export async function setShopActive(actor: SessionUser, shopId: string, active: boolean) {
  const shop = await db.shop.findUnique({ where: { id: shopId }, include: { address: true } });
  if (!shop) throw notFound("Shop");
  if (active && shop.approvalStatus !== "APPROVED") throw badRequest("Approve the shop before activating it");
  if (active && !shop.address) throw badRequest("Set the shop address and location before activating");
  if (active && !shop.ownerId) throw badRequest("Assign a shop owner before activating");
  const updated = await db.shop.update({ where: { id: shopId }, data: { isActive: active } });
  if (!active) await db.cartItem.deleteMany({ where: { shopId } });
  await audit(actorOf(actor), active ? "shop.activate" : "shop.deactivate", "Shop", shopId);
  return updated;
}

// ───────────────────────────── Shop owners ─────────────────────────────

async function assertOwner(ownerId: string) {
  const o = await db.shopOwner.findUnique({ where: { id: ownerId }, include: { user: true } });
  if (!o || o.user.deletedAt) throw badRequest("Invalid shop owner");
  return o;
}

export const zOwnerInput = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email().transform((e) => e.toLowerCase()),
  phone: zPhone,
  password: z.string().max(100).optional().nullable(),
  shopIds: z.array(z.string()).max(20).optional(),
});

export async function createOwner(actor: SessionUser, input: z.infer<typeof zOwnerInput>) {
  const password = input.password || temporaryPassword();
  if (!passwordPolicy.test(password)) throw badRequest(passwordPolicy.message);
  const clash = await db.user.findFirst({ where: { OR: [{ email: input.email }, { phone: input.phone }] } });
  if (clash) throw conflict("A user with this email or phone already exists");
  const user = await db.user.create({
    data: {
      role: "SHOP_OWNER",
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash: await hashPassword(password),
      shopOwner: { create: {} },
    },
    include: { shopOwner: true },
  });
  if (input.shopIds?.length) {
    await db.shop.updateMany({ where: { id: { in: input.shopIds } }, data: { ownerId: user.shopOwner!.id } });
  }
  await audit(actorOf(actor), "owner.create", "User", user.id, { after: { name: input.name, email: input.email, shopIds: input.shopIds } });
  return { id: user.id, ownerId: user.shopOwner!.id, temporaryPassword: input.password ? null : password };
}

export async function updateOwner(
  actor: SessionUser,
  userId: string,
  input: { name?: string; email?: string; phone?: string; status?: "ACTIVE" | "INACTIVE" },
) {
  const u = await db.user.findFirst({ where: { id: userId, role: "SHOP_OWNER" } });
  if (!u) throw notFound("Shop owner");
  const updated = await db.user.update({
    where: { id: userId },
    data: {
      ...input,
      // Deactivation revokes all live sessions immediately.
      ...(input.status && input.status !== u.status ? { sessionVersion: { increment: 1 } } : {}),
    },
  });
  await audit(actorOf(actor), "owner.update", "User", userId, { before: { status: u.status }, after: input });
  return updated;
}

export async function resetPassword(actor: SessionUser, userId: string, newPassword?: string | null) {
  const u = await db.user.findFirst({ where: { id: userId, role: { in: ["SHOP_OWNER", "SUPER_ADMIN", "DEALER"] } } });
  if (!u) throw notFound("User");
  const password = newPassword || temporaryPassword();
  if (!passwordPolicy.test(password)) throw badRequest(passwordPolicy.message);
  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password), sessionVersion: { increment: 1 } },
  });
  await audit(actorOf(actor), "user.password_reset", "User", userId);
  await notifyUsers([userId], { type: "SHOP", title: "Password reset", body: "Your password was reset by the administrator." });
  return { temporaryPassword: newPassword ? null : password };
}

export async function assignOwner(actor: SessionUser, shopId: string, ownerId: string | null) {
  if (ownerId) await assertOwner(ownerId);
  const shop = await db.shop.update({ where: { id: shopId }, data: { ownerId } });
  await audit(actorOf(actor), "shop.assign_owner", "Shop", shopId, { after: { ownerId } });
  return shop;
}

// ───────────────────────────── Categories ─────────────────────────────

export const zCategoryInput = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).optional().nullable(),
  imageUrl: z.string().max(500).optional().nullable(),
  taxRateBps: z.number().int().min(0).max(2800).optional().nullable(),
  sortOrder: z.number().int().min(0).max(1000).default(0),
  isActive: z.boolean().default(true),
});

export async function upsertCategory(actor: SessionUser, id: string | null, input: z.infer<typeof zCategoryInput>) {
  const slug = slugify(input.name);
  const clash = await db.category.findFirst({ where: { slug, NOT: id ? { id } : undefined } });
  if (clash) throw conflict("A category with this name already exists");
  const cat = id
    ? await db.category.update({ where: { id }, data: { ...input, slug } })
    : await db.category.create({ data: { ...input, slug } });
  await audit(actorOf(actor), id ? "category.update" : "category.create", "Category", cat.id, { after: input });
  return cat;
}

export const zSubcategoryInput = z.object({
  categoryId: z.string().min(1),
  name: z.string().trim().min(2).max(60),
  imageUrl: z.string().max(500).optional().nullable(),
  sortOrder: z.number().int().min(0).max(1000).default(0),
  isActive: z.boolean().default(true),
});

export async function upsertSubcategory(actor: SessionUser, id: string | null, input: z.infer<typeof zSubcategoryInput>) {
  const slug = slugify(input.name);
  const clash = await db.subcategory.findFirst({ where: { categoryId: input.categoryId, slug, NOT: id ? { id } : undefined } });
  if (clash) throw conflict("This subcategory already exists in the category");
  const sub = id
    ? await db.subcategory.update({ where: { id }, data: { ...input, slug } })
    : await db.subcategory.create({ data: { ...input, slug } });
  await audit(actorOf(actor), id ? "subcategory.update" : "subcategory.create", "Subcategory", sub.id, { after: input });
  return sub;
}

// ───────────────────────────── Customers ─────────────────────────────

export async function setCustomerStatus(actor: SessionUser, customerId: string, status: "ACTIVE" | "INACTIVE") {
  const c = await db.customer.findUnique({ where: { id: customerId } });
  if (!c) throw notFound("Customer");
  await db.user.update({ where: { id: c.userId }, data: { status, sessionVersion: { increment: 1 } } });
  await audit(actorOf(actor), `customer.${status.toLowerCase()}`, "Customer", customerId);
}

export function customerWhere(search?: string): Prisma.CustomerWhereInput {
  return search
    ? {
        user: {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { phone: { contains: search } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        },
      }
    : {};
}
