import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";

/** Every admin-configurable platform setting, with validation and defaults. */
export const settingsSchema = z.object({
  platform: z
    .object({
      name: z.string().min(1).max(60).default("Dukaan Express"),
      logoUrl: z.string().max(500).nullable().default(null),
      supportPhone: z.string().max(20).default("1800-123-4567"),
      supportEmail: z.string().max(120).default("support@dukaanexpress.in"),
      timeZone: z.string().default("Asia/Kolkata"),
    })
    .prefault({}),
  commission: z
    .object({
      defaultBps: z.number().int().min(0).max(5000).default(1000), // 10%
      chargeOn: z.enum(["ITEMS_AFTER_COUPON", "ITEMS_BEFORE_COUPON"]).default("ITEMS_AFTER_COUPON"),
    })
    .prefault({}),
  order: z
    .object({
      minOrderAmount: z.number().int().min(0).default(9900),
      maxItemsPerOrder: z.number().int().min(1).max(200).default(50),
      shopAcceptTimeoutMinutes: z.number().int().min(1).max(120).default(10),
      paymentTimeoutMinutes: z.number().int().min(1).max(120).default(15),
    })
    .prefault({}),
  cancellation: z
    .object({
      // Customer may cancel while the order is in one of these statuses
      customerCancellableStatuses: z
        .array(z.string())
        .default(["PAYMENT_PENDING", "PAYMENT_CONFIRMED", "SHOP_PENDING", "SHOP_ACCEPTED"]),
      cancellationFeePaise: z.number().int().min(0).default(0),
    })
    .prefault({}),
  refund: z
    .object({
      autoRefundOnCancel: z.boolean().default(true),
      autoRefundOnReject: z.boolean().default(true),
    })
    .prefault({}),
  delivery: z
    .object({
      baseFee: z.number().int().min(0).default(2500),
      perKmFee: z.number().int().min(0).default(500),
      freeDeliveryThreshold: z.number().int().min(0).default(49900),
      maxRadiusKm: z.number().min(0.5).max(50).default(10),
      avgSpeedKmph: z.number().min(5).max(80).default(20),
      handoverBufferMinutes: z.number().int().min(0).default(5),
      courierStrategy: z.enum(["FASTEST", "CHEAPEST", "RECOMMENDED"]).default("FASTEST"),
      autoSchedulePickup: z.boolean().default(true),
    })
    .prefault({}),
  tax: z
    .object({
      enabled: z.boolean().default(true),
      pricesInclusive: z.boolean().default(true),
      defaultRateBps: z.number().int().min(0).max(2800).default(500),
      deliveryFeeTaxBps: z.number().int().min(0).max(2800).default(1800),
    })
    .prefault({}),
  payments: z
    .object({
      onlineEnabled: z.boolean().default(true),
      upi: z.boolean().default(true),
      card: z.boolean().default(true),
      netbanking: z.boolean().default(true),
      codEnabled: z.boolean().default(true),
      codMaxAmount: z.number().int().min(0).default(300000),
    })
    .prefault({}),
  approvals: z
    .object({
      shopApprovalRequired: z.boolean().default(true),
      productApprovalRequired: z.boolean().default(false),
    })
    .prefault({}),
  coupons: z
    .object({
      enabled: z.boolean().default(true),
      maxDiscountPercentOfOrder: z.number().int().min(0).max(100).default(50),
    })
    .prefault({}),
  // Business identity shown on the policy pages (required by the Consumer Protection (E-Commerce) Rules, 2020).
  legal: z
    .object({
      businessName: z.string().max(120).default(""), // registered legal name, e.g. "Dukaan Express Private Limited"
      registeredAddress: z.string().max(300).default(""),
      gstin: z.string().max(15).default(""),
      grievanceOfficerName: z.string().max(80).default(""),
      grievanceOfficerEmail: z.string().max(120).default(""),
      grievanceOfficerPhone: z.string().max(20).default(""),
      jurisdictionCity: z.string().max(60).default("Bengaluru"),
      policiesUpdatedOn: z.string().max(20).default("2026-11-11"), // YYYY-MM-DD
    })
    .prefault({}),
});

export type PlatformSettings = z.infer<typeof settingsSchema>;
export type SettingsGroup = keyof PlatformSettings;
export const SETTINGS_GROUPS = Object.keys(settingsSchema.shape) as SettingsGroup[];

let cache: { at: number; value: PlatformSettings } | null = null;
const TTL_MS = 15_000;

export async function getSettings(fresh = false): Promise<PlatformSettings> {
  if (!fresh && cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const rows = await db.setting.findMany();
  const raw: Record<string, unknown> = {};
  for (const r of rows) raw[r.key] = r.value;
  const value = settingsSchema.parse(raw);
  cache = { at: Date.now(), value };
  return value;
}

export async function updateSettingsGroup<K extends SettingsGroup>(
  group: K,
  patch: Partial<PlatformSettings[K]>,
  actorId: string | null,
) {
  const current = await getSettings(true);
  const merged = { ...current[group], ...patch };
  const validated = settingsSchema.shape[group].parse(merged) as PlatformSettings[K];
  await db.setting.upsert({
    where: { key: group },
    create: { key: group, value: validated as Prisma.InputJsonValue, updatedById: actorId },
    update: { value: validated as Prisma.InputJsonValue, updatedById: actorId },
  });
  cache = null;
  return validated;
}

export function invalidateSettingsCache() {
  cache = null;
}
