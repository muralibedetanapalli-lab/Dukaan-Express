export interface LatLng {
  lat: number;
  lng: number;
}

/** Great-circle distance in km. */
export function haversineKm(a: LatLng, b: LatLng) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const toRad = (d: number) => (d * Math.PI) / 180;

/** Road distance is typically ~1.3× straight-line inside Indian cities. */
export const ROAD_FACTOR = 1.3;

export function isOpenNow(
  hours: { dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean }[],
  now: Date = new Date(),
  timeZone = "Asia/Kolkata",
) {
  if (!hours.length) return true;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
  const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  const cur = `${hh === "24" ? "00" : hh}:${mm}`;
  const today = hours.find((h) => h.dayOfWeek === day);
  if (!today || today.isClosed) return false;
  if (today.closeTime > today.openTime) return cur >= today.openTime && cur < today.closeTime;
  // overnight shops (e.g. 18:00 – 02:00)
  return cur >= today.openTime || cur < today.closeTime;
}
