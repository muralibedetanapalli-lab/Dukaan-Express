import { z } from "zod";
import { api } from "@/server/http";
import { db } from "@/server/db";
import { badRequest } from "@/server/errors";
import { audit } from "@/server/services/audit";
import type { Prisma } from "@/generated/prisma/client";

export const PATCH = api(
  {
    roles: ["SUPER_ADMIN"],
    body: z.object({
      name: z.string().trim().min(2).max(120).optional(),
      description: z.string().trim().max(2000).optional().nullable(),
      brand: z.string().trim().max(60).optional().nullable(),
      categoryId: z.string().optional(),
      subcategoryId: z.string().optional().nullable(),
      approvalStatus: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
      isActive: z.boolean().optional(),
      attributes: z.record(z.string(), z.string()).optional(),
      images: z.array(z.string().max(500)).max(8).optional(),
    }),
  },
  async ({ user, params, body }) => {
    const before = await db.product.findUniqueOrThrow({ where: { id: params.id } });
    const categoryId = body.categoryId ?? before.categoryId;
    if (body.subcategoryId) {
      const sub = await db.subcategory.findFirst({ where: { id: body.subcategoryId, categoryId } });
      if (!sub) throw badRequest("Subcategory does not belong to the category");
    }
    const { images, attributes, ...rest } = body;
    const updated = await db.product.update({
      where: { id: params.id },
      data: {
        ...rest,
        ...(body.categoryId && body.categoryId !== before.categoryId && body.subcategoryId === undefined ? { subcategoryId: null } : {}),
        ...(attributes ? { attributes: attributes as Prisma.InputJsonValue } : {}),
      },
    });
    if (images) {
      await db.$transaction([
        db.productImage.deleteMany({ where: { productId: params.id } }),
        db.productImage.createMany({ data: images.map((url, i) => ({ productId: params.id, url, sortOrder: i })) }),
      ]);
    }
    if (body.isActive === false || body.approvalStatus === "REJECTED") {
      await db.cartItem.deleteMany({ where: { inventory: { productId: params.id } } });
    }
    await audit({ id: user.id, role: user.role }, "product.update", "Product", params.id, {
      before: { categoryId: before.categoryId, approvalStatus: before.approvalStatus, isActive: before.isActive },
      after: body,
    });
    return updated;
  },
);
