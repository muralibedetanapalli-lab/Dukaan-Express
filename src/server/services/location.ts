import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/server/db";
import { distancesTo } from "@/server/integrations/maps";
import { isOpenNow, type LatLng } from "@/lib/geo";
import { getSettings } from "./settings";
import { estimateEtaMinutes } from "./pricing";

export const LOCATION_COOKIE = "dx_loc";

export const zLocation = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  label: z.string().max(200).default("Current location"),
  pincode: z.string().max(10).optional().nullable(),
  addressId: z.string().max(64).optional().nullable(),
});
export type CustomerLocation = z.infer<typeof zLocation>;

export async function readLocationCookie(): Promise<CustomerLocation | null> {
  const raw = (await cookies()).get(LOCATION_COOKIE)?.value;
  if (!raw) return null;
  try {
    return zLocation.parse(JSON.parse(decodeURIComponent(raw)));
  } catch {
    return null;
  }
}

export interface EligibleShop {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  coverUrl: string | null;
  categoryName: string | null;
  rating: number;
  ratingCount: number;
  avgPrepMinutes: number;
  deliveryRadiusKm: number;
  distanceKm: number;
  etaMinutes: number;
  isOpen: boolean;
  acceptingOrders: boolean;
  orderable: boolean;
  address: { line1: string; city: string; pincode: string; latitude: number; longitude: number };
}

/**
 * Shops that deliver to a point: approved, active, within both the shop's own radius and the
 * platform maximum. Sorted by orderability, then ETA, then distance.
 */
export async function eligibleShops(point: LatLng, now = new Date()): Promise<EligibleShop[]> {
  const settings = await getSettings();
  const maxR = settings.delivery.maxRadiusKm;
  const dLat = maxR / 111;
  const dLng = maxR / (111 * Math.cos((point.lat * Math.PI) / 180));
  const shops = await db.shop.findMany({
    where: {
      approvalStatus: "APPROVED",
      isActive: true,
      deletedAt: null,
      address: {
        latitude: { gte: point.lat - dLat, lte: point.lat + dLat },
        longitude: { gte: point.lng - dLng, lte: point.lng + dLng },
      },
    },
    include: { address: true, hours: true, category: { select: { name: true } } },
  });
  if (!shops.length) return [];
  const routes = await distancesTo(
    shops.map((s) => ({ lat: s.address!.latitude, lng: s.address!.longitude })),
    point,
  );
  const result: EligibleShop[] = [];
  shops.forEach((s, i) => {
    const r = routes[i];
    if (r.distanceKm > Math.min(s.deliveryRadiusKm, maxR)) return;
    const isOpen = isOpenNow(s.hours, now, settings.platform.timeZone);
    const travel = r.durationMinutes;
    const eta =
      travel != null
        ? Math.max(10, s.avgPrepMinutes + travel + settings.delivery.handoverBufferMinutes)
        : estimateEtaMinutes(r.distanceKm, s.avgPrepMinutes, settings.delivery.avgSpeedKmph, settings.delivery.handoverBufferMinutes);
    result.push({
      id: s.id,
      name: s.name,
      slug: s.slug,
      logoUrl: s.logoUrl,
      coverUrl: s.coverUrl,
      categoryName: s.category?.name ?? null,
      rating: s.rating,
      ratingCount: s.ratingCount,
      avgPrepMinutes: s.avgPrepMinutes,
      deliveryRadiusKm: s.deliveryRadiusKm,
      distanceKm: r.distanceKm,
      etaMinutes: eta,
      isOpen,
      acceptingOrders: s.acceptingOrders,
      orderable: isOpen && s.acceptingOrders,
      address: {
        line1: s.address!.line1,
        city: s.address!.city,
        pincode: s.address!.pincode,
        latitude: s.address!.latitude,
        longitude: s.address!.longitude,
      },
    });
  });
  return result.sort(
    (a, b) => Number(b.orderable) - Number(a.orderable) || a.etaMinutes - b.etaMinutes || a.distanceKm - b.distanceKm,
  );
}

/** Distance/ETA from one shop to a point, or null when the shop does not deliver there. */
export async function shopReach(shopId: string, point: LatLng) {
  const shops = await eligibleShops(point);
  return shops.find((s) => s.id === shopId) ?? null;
}
