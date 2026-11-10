import "server-only";
import { db } from "@/server/db";
import { badRequest, tooMany, unauthorized } from "@/server/errors";
import { hashPassword, randomDigits, sha256, verifyPassword, safeEqual } from "@/server/auth/password";
import { sendOtpSms } from "@/server/integrations/sms";
import { integrationModes } from "@/server/env";
import { audit } from "./audit";

const OTP_TTL_MS = 5 * 60_000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 30_000;
const OTP_MAX_PER_HOUR = 5;

let dummy: Promise<string> | null = null;
const dummyHash = () => (dummy ??= hashPassword("timing-equaliser-not-a-real-password"));

const otpHash = (phone: string, code: string) => sha256(`${phone}:${code}:${process.env.JWT_SECRET}`);

export async function requestOtp(phone: string) {
  const since = new Date(Date.now() - 3600_000);
  const recent = await db.otp.findMany({ where: { phone, createdAt: { gte: since } }, orderBy: { createdAt: "desc" } });
  if (recent.length >= OTP_MAX_PER_HOUR) throw tooMany("Too many OTP requests. Please try again in an hour.");
  if (recent[0] && Date.now() - recent[0].createdAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
    throw tooMany("Please wait 30 seconds before requesting another OTP");
  }
  // Customers cannot log in with a staff phone number via OTP.
  const existing = await db.user.findUnique({ where: { phone } });
  if (existing && existing.role !== "CUSTOMER") throw badRequest("This number is registered as a staff account. Use staff login.");
  if (existing && existing.status !== "ACTIVE") throw unauthorized("This account has been deactivated. Contact support.");

  const code = randomDigits(6);
  await db.otp.create({ data: { phone, codeHash: otpHash(phone, code), expiresAt: new Date(Date.now() + OTP_TTL_MS) } });
  const { mock } = await sendOtpSms(phone, code);
  // OTP_SANDBOX_IN_PRODUCTION=true shows the OTP on screen when no SMS provider is configured.
  // For private pilots only — anyone could then log in as any phone number.
  const exposeDevOtp = mock && (process.env.NODE_ENV !== "production" || process.env.OTP_SANDBOX_IN_PRODUCTION === "true");
  return { sent: true, expiresInSeconds: OTP_TTL_MS / 1000, devOtp: exposeDevOtp ? code : undefined, smsMode: integrationModes().sms };
}

export async function verifyOtpAndLogin(phone: string, code: string, profile?: { name?: string; email?: string | null }) {
  const otp = await db.otp.findFirst({
    where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) throw badRequest("OTP expired or not requested. Please request a new OTP.");
  if (otp.attempts >= OTP_MAX_ATTEMPTS) throw tooMany("Too many incorrect attempts. Please request a new OTP.");
  if (!safeEqual(otp.codeHash, otpHash(phone, code))) {
    await db.otp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    throw badRequest("Incorrect OTP");
  }
  // Consume atomically so the same OTP cannot be used twice concurrently.
  const consumed = await db.otp.updateMany({ where: { id: otp.id, consumedAt: null }, data: { consumedAt: new Date() } });
  if (consumed.count !== 1) throw badRequest("OTP already used");

  let user = await db.user.findUnique({ where: { phone } });
  let isNew = false;
  if (!user) {
    isNew = true;
    user = await db.user.create({
      data: {
        role: "CUSTOMER",
        phone,
        name: profile?.name?.trim() || null,
        email: profile?.email?.trim().toLowerCase() || null,
        customer: { create: { cart: { create: {} } } },
      },
    });
  } else {
    if (user.role !== "CUSTOMER") throw badRequest("Use staff login for this account");
    if (user.status !== "ACTIVE") throw unauthorized("This account has been deactivated. Contact support.");
    user = await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  }
  return { user, isNew };
}

export async function staffLogin(email: string, password: string, ip: string) {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  // Always run bcrypt to keep timing uniform whether or not the user exists.
  const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash()));
  if (!user || !ok || user.role === "CUSTOMER" || user.deletedAt) throw unauthorized("Invalid email or password");
  if (user.status !== "ACTIVE") throw unauthorized("Your account is deactivated. Contact the administrator.");
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ id: user.id, role: user.role }, "auth.login", "User", user.id, { ip });
  return user;
}
