import { api } from "@/server/http";
import { db } from "@/server/db";

/** Admin-managed serviceable localities for manual location selection. */
export const GET = api({}, async () => {
  const areas = await db.serviceArea.findMany({ where: { isActive: true }, orderBy: { city: "asc" } });
  return {
    areas: areas.map((a) => ({
      city: a.city,
      state: a.state,
      localities: (a.localities as { name: string; lat: number; lng: number; pincode: string }[]) ?? [],
    })),
  };
});
