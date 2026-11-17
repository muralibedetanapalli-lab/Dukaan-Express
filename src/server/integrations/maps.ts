import "server-only";
import { env } from "@/server/env";
import { haversineKm, ROAD_FACTOR, type LatLng } from "@/lib/geo";

/**
 * Maps, at zero cost by default:
 *  - Address from GPS (reverse geocoding): Google Geocoding if GOOGLE_MAPS_API_KEY is set, otherwise
 *    OpenStreetMap Nominatim (free, no key — max 1 request/second, identified by User-Agent, results cached).
 *  - Shop → customer road distance: Google Distance Matrix if configured, else OpenRouteService if
 *    ORS_API_KEY is set (free plan, no card), else straight-line distance × road factor.
 */

export interface RouteEstimate {
  distanceKm: number;
  durationMinutes: number | null;
  source: "google" | "openrouteservice" | "haversine";
}

const USER_AGENT = `DukaanExpress/1.0 (+${(process.env.APP_URL ?? "https://dukaanexpress.in").replace(/\/$/, "")})`;

// ───────────────────────────── Road distance ─────────────────────────────

const cache = new Map<string, { at: number; v: RouteEstimate }>();
const TTL = 10 * 60_000;
const key = (o: LatLng, d: LatLng) => `${o.lat.toFixed(4)},${o.lng.toFixed(4)}>${d.lat.toFixed(4)},${d.lng.toFixed(4)}`;

/** Distances from many origins (shops) to one destination (customer). Never throws: falls back to haversine. */
export async function distancesTo(origins: LatLng[], destination: LatLng): Promise<RouteEstimate[]> {
  const result = origins.map<RouteEstimate>((o) => ({
    distanceKm: Math.round(haversineKm(o, destination) * ROAD_FACTOR * 100) / 100,
    durationMinutes: null,
    source: "haversine",
  }));
  const e = env();
  const provider = e.GOOGLE_MAPS_API_KEY ? "google" : e.ORS_API_KEY ? "openrouteservice" : null;
  if (!provider || origins.length === 0) return result;

  const missing: number[] = [];
  origins.forEach((o, i) => {
    const hit = cache.get(key(o, destination));
    if (hit && Date.now() - hit.at < TTL) result[i] = hit.v;
    else missing.push(i);
  });
  // Only shops reasonably near need a road distance; far ones are out of range anyway (saves quota).
  const near = missing.filter((i) => result[i].distanceKm <= 60);

  const batchSize = provider === "google" ? 25 : 50;
  for (let start = 0; start < near.length; start += batchSize) {
    const batch = near.slice(start, start + batchSize);
    try {
      const rows = provider === "google" ? await googleMatrix(batch.map((i) => origins[i]), destination) : await orsMatrix(batch.map((i) => origins[i]), destination);
      batch.forEach((originIdx, row) => {
        const r = rows[row];
        if (!r) return;
        const v: RouteEstimate = { distanceKm: Math.round(r.km * 100) / 100, durationMinutes: r.minutes, source: provider };
        result[originIdx] = v;
        cache.set(key(origins[originIdx], destination), { at: Date.now(), v });
      });
    } catch (err) {
      console.warn(`[maps] ${provider} distance failed, using straight-line estimate`, err instanceof Error ? err.message : err);
    }
  }
  return result;
}

type Row = { km: number; minutes: number | null } | null;

async function googleMatrix(origins: LatLng[], destination: LatLng): Promise<Row[]> {
  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  url.searchParams.set("origins", origins.map((o) => `${o.lat},${o.lng}`).join("|"));
  url.searchParams.set("destinations", `${destination.lat},${destination.lng}`);
  url.searchParams.set("mode", "driving");
  url.searchParams.set("key", env().GOOGLE_MAPS_API_KEY!);
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  const json = (await res.json()) as { status: string; rows?: { elements: { status: string; distance?: { value: number }; duration?: { value: number } }[] }[] };
  if (json.status !== "OK") throw new Error(json.status);
  return origins.map((_, i) => {
    const el = json.rows?.[i]?.elements?.[0];
    return el?.status === "OK" && el.distance ? { km: el.distance.value / 1000, minutes: el.duration ? Math.round(el.duration.value / 60) : null } : null;
  });
}

/** OpenRouteService Matrix API (driving). Free plan: 500 requests/day, 40/minute. */
async function orsMatrix(origins: LatLng[], destination: LatLng): Promise<Row[]> {
  const locations = [...origins, destination].map((p) => [p.lng, p.lat]);
  const res = await fetch("https://api.openrouteservice.org/v2/matrix/driving-car", {
    method: "POST",
    headers: { Authorization: env().ORS_API_KEY!, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ locations, sources: origins.map((_, i) => i), destinations: [origins.length], metrics: ["distance", "duration"], units: "km" }),
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`ORS ${res.status}`);
  const json = (await res.json()) as { distances?: (number | null)[][]; durations?: (number | null)[][] };
  return origins.map((_, i) => {
    const km = json.distances?.[i]?.[0];
    const sec = json.durations?.[i]?.[0];
    return km != null ? { km, minutes: sec != null ? Math.round(sec / 60) : null } : null;
  });
}

// ───────────────────────────── Address from GPS ─────────────────────────────

export interface GeocodedAddress {
  formatted: string;
  line1: string;
  city: string;
  state: string;
  pincode: string;
  source: "google" | "openstreetmap";
}

const geoCache = new Map<string, { at: number; v: GeocodedAddress | null }>();
const GEO_TTL = 24 * 60 * 60_000;

export async function reverseGeocode(p: LatLng): Promise<GeocodedAddress | null> {
  const k = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`; // ~11 m
  const hit = geoCache.get(k);
  if (hit && Date.now() - hit.at < GEO_TTL) return hit.v;
  const v = env().GOOGLE_MAPS_API_KEY ? await googleReverse(p) : await nominatimReverse(p);
  if (v) {
    if (geoCache.size > 5000) geoCache.clear();
    geoCache.set(k, { at: Date.now(), v });
  }
  return v;
}

async function googleReverse(p: LatLng): Promise<GeocodedAddress | null> {
  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("latlng", `${p.lat},${p.lng}`);
    url.searchParams.set("key", env().GOOGLE_MAPS_API_KEY!);
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const json = (await res.json()) as { results?: { formatted_address: string; address_components: { long_name: string; types: string[] }[] }[] };
    const r = json.results?.[0];
    if (!r) return null;
    const comp = (t: string) => r.address_components.find((c) => c.types.includes(t))?.long_name ?? "";
    return {
      formatted: r.formatted_address,
      line1: [comp("street_number"), comp("route"), comp("sublocality")].filter(Boolean).join(", "),
      city: comp("locality") || comp("administrative_area_level_2"),
      state: comp("administrative_area_level_1"),
      pincode: comp("postal_code"),
      source: "google",
    };
  } catch {
    return null;
  }
}

// Nominatim usage policy: max 1 request per second per application. Calls are queued in-process.
let nominatimChain: Promise<unknown> = Promise.resolve();
let lastNominatimAt = 0;

async function nominatimReverse(p: LatLng): Promise<GeocodedAddress | null> {
  const run = async (): Promise<GeocodedAddress | null> => {
    const wait = lastNominatimAt + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastNominatimAt = Date.now();
    try {
      const url = new URL("https://nominatim.openstreetmap.org/reverse");
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("lat", String(p.lat));
      url.searchParams.set("lon", String(p.lng));
      url.searchParams.set("zoom", "18");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("accept-language", "en");
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(6000) });
      if (!res.ok) return null;
      const j = (await res.json()) as { display_name?: string; address?: Record<string, string> };
      const a = j.address;
      if (!a) return null;
      const street = [a.house_number, a.road].filter(Boolean).join(" ");
      const area = a.neighbourhood || a.suburb || a.quarter || a.residential || "";
      const city = (a.city || a.town || a.village || a.city_district || a.county || a.state_district || "").replace(/\s+(Mandal|Taluk|Tehsil|Tahsil)$/i, "");
      return {
        formatted: [street, area, city].filter(Boolean).join(", ") || j.display_name || "",
        line1: [a.building || a.amenity || "", street, area].filter(Boolean).join(", "),
        city,
        state: a.state || "",
        pincode: (a.postcode || "").replace(/\s/g, "").slice(0, 6),
        source: "openstreetmap",
      };
    } catch {
      return null;
    }
  };
  const next = nominatimChain.then(run, run);
  nominatimChain = next.catch(() => undefined);
  return next;
}

// ───────────────────────────── Area / pincode search ─────────────────────────────

export interface PlaceResult {
  lat: number;
  lng: number;
  label: string;
  city: string;
  state: string;
  pincode: string;
}

const searchCache = new Map<string, { at: number; v: PlaceResult[] }>();

/**
 * Find a place by Indian pincode or by name (area, locality, landmark) with OpenStreetMap Nominatim.
 * Shares the 1-request-per-second queue with reverse geocoding; results are cached for a day.
 */
export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  const q = query.trim().replace(/\s+/g, " ");
  if (q.length < 3) return [];
  const k = q.toLowerCase();
  const hit = searchCache.get(k);
  if (hit && Date.now() - hit.at < GEO_TTL) return hit.v;

  const run = async (): Promise<PlaceResult[]> => {
    const wait = lastNominatimAt + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastNominatimAt = Date.now();
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("accept-language", "en");
      url.searchParams.set("countrycodes", "in");
      url.searchParams.set("limit", "5");
      if (/^\d{6}$/.test(q)) url.searchParams.set("postalcode", q);
      else url.searchParams.set("q", q);
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(6000) });
      if (!res.ok) return [];
      const rows = (await res.json()) as { lat: string; lon: string; display_name: string; address?: Record<string, string> }[];
      return rows.map((r) => {
        const a = r.address ?? {};
        const city = (a.city || a.town || a.village || a.city_district || a.county || a.state_district || "").replace(/\s+(Mandal|Taluk|Tehsil|Tahsil)$/i, "");
        const area = a.suburb || a.neighbourhood || a.quarter || a.village || a.town || "";
        return {
          lat: Number(r.lat),
          lng: Number(r.lon),
          label: [area, city, a.postcode].filter(Boolean).join(", ") || r.display_name,
          city,
          state: a.state || "",
          pincode: (a.postcode || (/^\d{6}$/.test(q) ? q : "")).replace(/\s/g, "").slice(0, 6),
        };
      });
    } catch {
      return [];
    }
  };
  const next = nominatimChain.then(run, run);
  nominatimChain = next.catch(() => undefined);
  const v = await next;
  if (v.length) {
    if (searchCache.size > 2000) searchCache.clear();
    searchCache.set(k, { at: Date.now(), v });
  }
  return v;
}
