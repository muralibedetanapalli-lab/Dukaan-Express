import { api } from "@/server/http";
import { createSessionCookie } from "@/server/auth/session";
import { signupRider, zRiderSignup } from "@/server/services/rider-kyc";

/** Rider self-signup (email verified first via /auth/signup/send-code + verify-code). Logs the rider in. */
export const POST = api({ body: zRiderSignup, rateLimit: { name: "rider-signup", limit: 10 } }, async ({ body, ip }) => {
  const user = await signupRider(body, ip);
  await createSessionCookie(user);
  return { redirect: "/rider" };
});
