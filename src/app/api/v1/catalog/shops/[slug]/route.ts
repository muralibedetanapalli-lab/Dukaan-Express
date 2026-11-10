import { api } from "@/server/http";
import { shopStorefront } from "@/server/services/catalog";
import { readLocationCookie } from "@/server/services/location";

export const GET = api({}, async ({ params }) => {
  const loc = await readLocationCookie();
  return shopStorefront(params.slug, loc ? { lat: loc.lat, lng: loc.lng } : null);
});
