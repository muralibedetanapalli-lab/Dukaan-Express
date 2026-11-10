import "server-only";
import { importPKCS8, SignJWT } from "jose";
import { env, integrationModes } from "@/server/env";

/**
 * Firebase Cloud Messaging HTTP v1 sender using a service account (no firebase-admin dependency).
 * Mock mode logs instead of sending; in-app notifications + SSE still work.
 */
const g = globalThis as unknown as { __fcmToken?: { value: string; exp: number } };

async function accessToken() {
  if (g.__fcmToken && g.__fcmToken.exp > Date.now() + 60_000) return g.__fcmToken.value;
  const e = env();
  const pk = await importPKCS8(e.FCM_PRIVATE_KEY!.replace(/\\n/g, "\n"), "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(e.FCM_CLIENT_EMAIL!)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(pk);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    signal: AbortSignal.timeout(8000),
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("FCM auth failed");
  g.__fcmToken = { value: json.access_token, exp: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return json.access_token;
}

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
  link?: string;
}

/** Returns tokens that FCM reported as invalid so callers can prune them. */
export async function sendPush(tokens: string[], msg: PushMessage): Promise<{ invalidTokens: string[] }> {
  if (tokens.length === 0) return { invalidTokens: [] };
  if (integrationModes().fcm !== "live") {
    if (process.env.NODE_ENV === "development") console.info(`[fcm:mock] → ${tokens.length} device(s): ${msg.title}`);
    return { invalidTokens: [] };
  }
  const invalid: string[] = [];
  const at = await accessToken();
  await Promise.all(
    tokens.map(async (token) => {
      try {
        const res = await fetch(`https://fcm.googleapis.com/v1/projects/${env().FCM_PROJECT_ID}/messages:send`, {
          method: "POST",
          headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: msg.title, body: msg.body },
              data: msg.data ?? {},
              webpush: msg.link ? { fcm_options: { link: msg.link } } : undefined,
            },
          }),
          signal: AbortSignal.timeout(8000),
        });
        if (res.status === 404 || res.status === 400) invalid.push(token);
      } catch (e) {
        console.warn("[fcm] send failed", e);
      }
    }),
  );
  return { invalidTokens: invalid };
}
