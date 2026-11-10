import { z } from "zod";

export const zCoupon = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{3,20}$/, "3–20 letters or digits"),
  description: z.string().trim().max(200).optional().nullable(),
  type: z.enum(["FLAT", "PERCENT"]),
  value: z.number().int().min(1),
  maxDiscount: z.number().int().min(1).optional().nullable(),
  minOrderAmount: z.number().int().min(0).default(0),
  usageLimit: z.number().int().min(1).optional().nullable(),
  perUserLimit: z.number().int().min(1).max(100).default(1),
  firstOrderOnly: z.boolean().default(false),
  shopId: z.string().optional().nullable(),
  validFrom: z.coerce.date().default(() => new Date()),
  validTo: z.coerce.date().optional().nullable(),
  isActive: z.boolean().default(true),
});

export const zBanner = z.object({
  title: z.string().trim().min(2).max(80),
  subtitle: z.string().trim().max(160).optional().nullable(),
  imageUrl: z.string().max(500).optional().nullable(),
  linkUrl: z
    .string()
    .max(300)
    .regex(/^\/[^\s]*$/, "Use an internal path like /search?category=…")
    .optional()
    .nullable(),
  bgColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#0f766e"),
  sortOrder: z.number().int().min(0).max(1000).default(0),
  isActive: z.boolean().default(true),
  startsAt: z.coerce.date().optional().nullable(),
  endsAt: z.coerce.date().optional().nullable(),
});

export const zServiceArea = z.object({
  city: z.string().trim().min(2).max(60),
  state: z.string().trim().min(2).max(60),
  pincodes: z.array(z.string().regex(/^\d{6}$/)).max(500).default([]),
  localities: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(60),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        pincode: z.string().regex(/^\d{6}$/),
      }),
    )
    .max(200)
    .default([]),
  centerLat: z.number().min(-90).max(90).optional().nullable(),
  centerLng: z.number().min(-180).max(180).optional().nullable(),
  radiusKm: z.number().min(1).max(100).optional().nullable(),
  isActive: z.boolean().default(true),
});
