import "server-only";
import { env, integrationModes } from "@/server/env";

/**
 * OTP delivery. Live: MSG91 OTP API (DLT template). Mock: logs the OTP on the server
 * (and the auth API returns it in development only so local testing works without SMS).
 */
export async function sendOtpSms(phone: string, otp: string): Promise<{ delivered: boolean; mock: boolean }> {
  if (integrationModes().sms !== "live") {
    console.info(`[sms:mock] OTP for +91${phone}: ${otp}`);
    return { delivered: true, mock: true };
  }
  const e = env();
  if (e.SMS_PROVIDER !== "msg91") throw new Error(`Unsupported SMS_PROVIDER "${e.SMS_PROVIDER}" (supported: msg91)`);
  const url = new URL("https://control.msg91.com/api/v5/otp");
  url.searchParams.set("template_id", e.SMS_TEMPLATE_ID ?? "");
  url.searchParams.set("mobile", `91${phone}`);
  url.searchParams.set("otp", otp);
  const res = await fetch(url, {
    method: "POST",
    headers: { authkey: e.SMS_API_KEY!, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  return { delivered: res.ok, mock: false };
}
