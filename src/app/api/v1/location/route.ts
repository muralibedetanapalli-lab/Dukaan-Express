import { cookies } from "next/headers";
import { api } from "@/server/http";
import { eligibleShops, LOCATION_COOKIE, zLocation } from "@/server/services/location";

/** Set the browsing location (stored in a cookie so server-rendered pages can use it). */
export const POST = api({ body: zLocation, rateLimit: { name: "location", limit: 60 } }, async ({ body }) => {
  (await cookies()).set(LOCATION_COOKIE, encodeURIComponent(JSON.stringify(body)), {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    httpOnly: false,
  });
  const shops = await eligibleShops({ lat: body.lat, lng: body.lng });
  return { location: body, serviceable: shops.length > 0, shopCount: shops.length, fastestEta: shops[0]?.etaMinutes ?? null };
});
