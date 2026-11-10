import { api } from "@/server/http";
import { badRequest } from "@/server/errors";
import { eligibleShops, readLocationCookie } from "@/server/services/location";

export const GET = api({}, async () => {
  const loc = await readLocationCookie();
  if (!loc) throw badRequest("Set your delivery location first");
  return { shops: await eligibleShops({ lat: loc.lat, lng: loc.lng }) };
});
