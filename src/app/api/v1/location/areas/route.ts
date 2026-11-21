import { api } from "@/server/http";
import { db } from "@/server/db";

/** Admin-managed serviceable localities for manual location selection. */
export const GET = api({}, async () => {
  const areas = await db.serviceArea.findMany({ where: { isActive: true }, orderBy: { city: "asc" } });
  // A city may have several areas (one per dealer pincode): show it once with all its localities.
  type Locality = { name: string; lat: number; lng: number; pincode: string };
  const byCity = new Map<string, { city: string; state: string; localities: Locality[] }>();
  for (const a of areas) {
    const key = `${a.city.trim().toLowerCase()}|${a.state.trim().toLowerCase()}`;
    const entry = byCity.get(key) ?? { city: a.city, state: a.state, localities: [] };
    entry.localities.push(...((a.localities as Locality[]) ?? []));
    byCity.set(key, entry);
  }
  return { areas: [...byCity.values()] };
});
