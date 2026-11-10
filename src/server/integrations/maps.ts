import "server-only";
import { env, integrationModes } from "@/server/env";
import { haversineKm, ROAD_FACTOR, type LatLng } from "@/lib/geo";

export interface RouteEstimate {
  distanceKm: number;
  durationMinutes: number | null;
  source: "google" | "haversine";
}

/**
 * Distances from many origins (shops) to one destination (customer).
 * Uses Google Distance Matrix when configured; otherwise haversine × road factor.
 * Google results are cached briefly to keep costs predictable.
 */
const cache = new Map<string, { at: number; v: RouteEstimate }>();
const TTL = 10 * 60_000;
const key = (o: LatLng, d: LatLng) => `${o.lat.toFixed(4)},${o.lng.toFixed(4)}>${d.lat.toFixed(4)},${d.lng.toFixed(4)}`;

export async function distancesTo(origins: LatLng[], destination: LatLng): Promise<RouteEstimate[]> {
  const fallback = origins.map<RouteEstimate>((o) => ({
    distanceKm: Math.round(haversineKm(o, destination) * ROAD_FACTOR * 100) / 100,
    durationMinutes: null,
    source: "haversine",
  }));
  if (integrationModes().maps !== "live" || origins.length === 0) return fallback;

  const result: RouteEstimate[] = [...fallback];
  const missing: number[] = [];
  origins.forEach((o, i) => {
    const hit = cache.get(key(o, destination));
    if (hit && Date.now() - hit.at < TTL) result[i] = hit.v;
    else missing.push(i);
  });

  // Distance Matrix allows 25 origins per request.
  for (let start = 0; start < missing.length; start += 25) {
    const batch = missing.slice(start, start + 25);
    try {
      const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
      url.searchParams.set("origins", batch.map((i) => `${origins[i].lat},${origins[i].lng}`).join("|"));
      url.searchParams.set("destinations", `${destination.lat},${destination.lng}`);
      url.searchParams.set("mode", "driving");
      url.searchParams.set("key", env().GOOGLE_MAPS_API_KEY!);
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const json = (await res.json()) as {
        status: string;
        rows?: { elements: { status: string; distance?: { value: number }; duration?: { value: number } }[] }[];
      };
      if (json.status !== "OK") throw new Error(json.status);
      batch.forEach((originIdx, row) => {
        const el = json.rows?.[row]?.elements?.[0];
        if (el?.status === "OK" && el.distance) {
          const v: RouteEstimate = {
            distanceKm: Math.round((el.distance.value / 1000) * 100) / 100,
            durationMinutes: el.duration ? Math.round(el.duration.value / 60) : null,
            source: "google",
          };
          result[originIdx] = v;
          cache.set(key(origins[originIdx], destination), { at: Date.now(), v });
        }
      });
    } catch (e) {
      console.warn("[maps] distance matrix failed, using haversine fallback", e);
    }
  }
  return result;
}

export interface GeocodedAddress {
  formatted: string;
  line1: string;
  city: string;
  state: string;
  pincode: string;
}

export async function reverseGeocode(p: LatLng): Promise<GeocodedAddress | null> {
  if (integrationModes().maps !== "live") return null;
  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("latlng", `${p.lat},${p.lng}`);
    url.searchParams.set("key", env().GOOGLE_MAPS_API_KEY!);
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const json = (await res.json()) as {
      results?: { formatted_address: string; address_components: { long_name: string; types: string[] }[] }[];
    };
    const r = json.results?.[0];
    if (!r) return null;
    const comp = (t: string) => r.address_components.find((c) => c.types.includes(t))?.long_name ?? "";
    return {
      formatted: r.formatted_address,
      line1: [comp("street_number"), comp("route"), comp("sublocality")].filter(Boolean).join(", "),
      city: comp("locality") || comp("administrative_area_level_2"),
      state: comp("administrative_area_level_1"),
      pincode: comp("postal_code"),
    };
  } catch {
    return null;
  }
}
