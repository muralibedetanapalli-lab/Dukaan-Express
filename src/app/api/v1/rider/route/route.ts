import { z } from "zod";
import { api } from "@/server/http";
import { routeLine } from "@/server/integrations/maps";

const coord = (min: number, max: number) => z.coerce.number().min(min).max(max);

/** Road route from the rider's position to the shop or customer, for the map on the rider's delivery screen. */
export const GET = api(
  {
    roles: ["RIDER"],
    query: z.object({ fromLat: coord(-90, 90), fromLng: coord(-180, 180), toLat: coord(-90, 90), toLng: coord(-180, 180) }),
    rateLimit: { name: "rider-route", limit: 20 },
  },
  async ({ query }) => routeLine({ lat: query.fromLat, lng: query.fromLng }, { lat: query.toLat, lng: query.toLng }),
);
