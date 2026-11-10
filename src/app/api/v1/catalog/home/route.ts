import { api } from "@/server/http";
import { badRequest } from "@/server/errors";
import { homeFeed } from "@/server/services/catalog";
import { readLocationCookie } from "@/server/services/location";

export const GET = api({}, async ({ user }) => {
  const loc = await readLocationCookie();
  if (!loc) throw badRequest("Set your delivery location first");
  return homeFeed({ lat: loc.lat, lng: loc.lng }, user?.customerId ?? null);
});
