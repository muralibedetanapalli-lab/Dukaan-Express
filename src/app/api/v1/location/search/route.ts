import { z } from "zod";
import { api } from "@/server/http";
import { searchPlaces } from "@/server/integrations/maps";

/** Find an area by pincode or name (OpenStreetMap). Used to move the address map to the right place. */
export const GET = api({ query: z.object({ q: z.string().trim().min(3).max(100) }), rateLimit: { name: "place-search", limit: 30 } }, async ({ query }) => ({
  places: await searchPlaces(query.q),
}));
