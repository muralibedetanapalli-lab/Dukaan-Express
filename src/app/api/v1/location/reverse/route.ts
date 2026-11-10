import { z } from "zod";
import { api } from "@/server/http";
import { reverseGeocode } from "@/server/integrations/maps";
import { db } from "@/server/db";
import { haversineKm } from "@/lib/geo";

export const GET = api(
  { query: z.object({ lat: z.coerce.number(), lng: z.coerce.number() }), rateLimit: { name: "geocode", limit: 30 } },
  async ({ query }) => {
    const geo = await reverseGeocode({ lat: query.lat, lng: query.lng });
    if (geo) return geo;
    // Fallback without Google: nearest configured service area.
    const areas = await db.serviceArea.findMany({ where: { isActive: true, centerLat: { not: null } } });
    const nearest = areas
      .map((a) => ({ a, d: haversineKm({ lat: a.centerLat!, lng: a.centerLng! }, { lat: query.lat, lng: query.lng }) }))
      .sort((x, y) => x.d - y.d)[0];
    return {
      formatted: nearest ? `Near ${nearest.a.city}` : "Current location",
      line1: "",
      city: nearest?.a.city ?? "",
      state: nearest?.a.state ?? "",
      pincode: nearest?.a.pincodes[0] ?? "",
    };
  },
);
