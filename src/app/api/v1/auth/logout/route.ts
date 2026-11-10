import { api } from "@/server/http";
import { clearSessionCookie } from "@/server/auth/session";

export const POST = api({}, async () => {
  await clearSessionCookie();
  return { ok: true };
});
