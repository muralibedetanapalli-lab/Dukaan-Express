import { z } from "zod";
import { api } from "@/server/http";
import { updateRiderLocation } from "@/server/services/delivery";

/** Live location from the rider app (every ~15 s while online). Shown to the customer during their delivery. */
export const POST = api(
  { roles: ["RIDER"], body: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }), rateLimit: { name: "rider-location", limit: 30 } },
  async ({ user, body }) => updateRiderLocation(user, body.lat, body.lng),
);
