import "server-only";
import { db } from "@/server/db";
import { SignJWT, jwtVerify } from "jose";
import { badRequest, conflict, tooMany, unauthorized } from "@/server/errors";
import { hashPassword, passwordPolicy, randomDigits, sha256, verifyPassword, safeEqual } from "@/server/auth/password";
import { codeEmail, sendEmail } from "@/server/integrations/email";
import { getSettings } from "./settings";
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

// ───────────────────────────── Email + password accounts (customers) ─────────────────────────────

const EMAIL_CODE_TTL_MS = 10 * 60_000;
const EMAIL_CODE_MAX_ATTEMPTS = 5;
const EMAIL_CODE_COOLDOWN_MS = 30_000;
const EMAIL_CODE_MAX_PER_HOUR = 5;
const SIGNUP_TOKEN_TTL = "30m";
const SIGNUP_TOKEN_ISSUER = "dukaan-express:email-verified"; // distinct issuer, so it is never accepted as a session

type EmailPurpose = "SIGNUP" | "RESET";
export const normaliseEmail = (e: string) => e.trim().toLowerCase();
const emailCodeHash = (email: string, purpose: EmailPurpose, code: string) => sha256(`${purpose}:${email}:${code}:${process.env.JWT_SECRET}`);
const tokenKey = () => new TextEncoder().encode(process.env.JWT_SECRET);

/** Show the code on screen only when no email provider is configured (dev, or a pilot that opted in). */
const exposeCode = (mock: boolean) => mock && (process.env.NODE_ENV !== "production" || process.env.OTP_SANDBOX_IN_PRODUCTION === "true");

async function issueEmailCode(email: string, purpose: EmailPurpose) {
  const since = new Date(Date.now() - 3600_000);
  const recent = await db.emailCode.findMany({ where: { email, purpose, createdAt: { gte: since } }, orderBy: { createdAt: "desc" } });
  if (recent.length >= EMAIL_CODE_MAX_PER_HOUR) throw tooMany("Too many codes requested. Please try again in an hour.");
  if (recent[0] && Date.now() - recent[0].createdAt.getTime() < EMAIL_CODE_COOLDOWN_MS) throw tooMany("Please wait 30 seconds before requesting another code");
  const code = randomDigits(6);
  await db.emailCode.create({ data: { email, purpose, codeHash: emailCodeHash(email, purpose, code), expiresAt: new Date(Date.now() + EMAIL_CODE_TTL_MS) } });
  const brand = (await getSettings()).platform.name;
  const copy =
    purpose === "SIGNUP"
      ? { subject: `${code} is your ${brand} verification code`, heading: "Verify your email", intro: `Enter this code to verify your email and finish creating your ${brand} account.` }
      : { subject: `${code} is your ${brand} password reset code`, heading: "Reset your password", intro: `Enter this code to set a new password for your ${brand} account.` };
  const body = codeEmail({ brand, heading: copy.heading, intro: copy.intro, code, minutes: EMAIL_CODE_TTL_MS / 60_000 });
  const { mock } = await sendEmail({ to: email, subject: copy.subject, ...body });
  return { sent: true, expiresInSeconds: EMAIL_CODE_TTL_MS / 1000, devCode: exposeCode(mock) ? code : undefined, emailMode: integrationModes().email };
}

async function consumeEmailCode(email: string, purpose: EmailPurpose, code: string) {
  const row = await db.emailCode.findFirst({ where: { email, purpose, consumedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
  if (!row) throw badRequest("Code expired or not requested. Please request a new code.");
  if (row.attempts >= EMAIL_CODE_MAX_ATTEMPTS) throw tooMany("Too many incorrect attempts. Please request a new code.");
  if (!safeEqual(row.codeHash, emailCodeHash(email, purpose, code))) {
    await db.emailCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    throw badRequest("Incorrect code");
  }
  const consumed = await db.emailCode.updateMany({ where: { id: row.id, consumedAt: null }, data: { consumedAt: new Date() } });
  if (consumed.count !== 1) throw badRequest("Code already used");
}

/** Signup step 1: email a code to an address that is not registered yet. */
export async function sendSignupCode(rawEmail: string) {
  const email = normaliseEmail(rawEmail);
  if (await db.user.findUnique({ where: { email }, select: { id: true } })) throw conflict("An account with this email already exists. Please log in.");
  return issueEmailCode(email, "SIGNUP");
}

/** Signup step 2: check the code and return a short-lived proof that this email was verified. */
export async function verifySignupCode(rawEmail: string, code: string) {
  const email = normaliseEmail(rawEmail);
  await consumeEmailCode(email, "SIGNUP", code);
  const token = await new SignJWT({ purpose: "signup" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(email)
    .setIssuer(SIGNUP_TOKEN_ISSUER)
    .setIssuedAt()
    .setExpirationTime(SIGNUP_TOKEN_TTL)
    .sign(tokenKey());
  return { verified: true, email, verificationToken: token };
}

/** Signup step 3: create the customer account. Needs the proof from step 2 for the same email. */
export async function signupCustomer(input: { name: string; phone: string; email: string; password: string; verificationToken: string }, ip: string) {
  const email = normaliseEmail(input.email);
  let verifiedEmail: string | undefined;
  try {
    const { payload } = await jwtVerify(input.verificationToken, tokenKey(), { issuer: SIGNUP_TOKEN_ISSUER, algorithms: ["HS256"] });
    if (payload.purpose === "signup") verifiedEmail = payload.sub;
  } catch {
    // invalid or expired: handled below
  }
  if (verifiedEmail !== email) throw badRequest("Email verification expired. Please verify your email again.");
  if (!passwordPolicy.test(input.password)) throw badRequest(passwordPolicy.message);

  const [byEmail, byPhone] = await Promise.all([
    db.user.findUnique({ where: { email }, select: { id: true } }),
    db.user.findUnique({ where: { phone: input.phone }, select: { id: true } }),
  ]);
  if (byEmail) throw conflict("An account with this email already exists. Please log in.");
  if (byPhone) throw conflict("This mobile number is already registered. Log in, or contact support if it isn't yours.");

  const user = await db.user
    .create({
      data: {
        role: "CUSTOMER",
        name: input.name.trim(),
        email,
        phone: input.phone,
        passwordHash: await hashPassword(input.password),
        emailVerifiedAt: new Date(),
        lastLoginAt: new Date(),
        customer: { create: { cart: { create: {} } } },
      },
    })
    .catch((e: unknown) => {
      // Unique-constraint race with a parallel signup.
      if (e && typeof e === "object" && "code" in e && e.code === "P2002") throw conflict("This email or mobile number is already registered");
      throw e;
    });
  await audit({ id: user.id, role: user.role }, "auth.signup", "User", user.id, { ip });
  return user;
}

/** Customers log in with their email or mobile number and password. */
export async function customerLogin(identifier: string, password: string, ip: string) {
  const id = identifier.trim();
  const digits = id.replace(/\D/g, "");
  const phone = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  const where = id.includes("@") ? { email: normaliseEmail(id) } : /^[6-9]\d{9}$/.test(phone) ? { phone } : null;
  const user = where ? await db.user.findUnique({ where }) : null;
  const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash()));
  if (!user || !ok || user.deletedAt) throw unauthorized("Invalid email/mobile number or password");
  if (user.role !== "CUSTOMER") throw badRequest("This is a staff account. Please use staff login.");
  if (user.status !== "ACTIVE") throw unauthorized("This account has been deactivated. Contact support.");
  const updated = await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ id: user.id, role: user.role }, "auth.login", "User", user.id, { ip });
  return updated;
}

/** Forgot password: always answers the same way, so it can't be used to find out which emails are registered. */
export async function sendPasswordResetCode(rawEmail: string) {
  const email = normaliseEmail(rawEmail);
  const user = await db.user.findUnique({ where: { email }, select: { id: true, status: true, deletedAt: true } });
  if (!user || user.status !== "ACTIVE" || user.deletedAt) {
    return { sent: true, expiresInSeconds: EMAIL_CODE_TTL_MS / 1000, devCode: undefined, emailMode: integrationModes().email };
  }
  return issueEmailCode(email, "RESET");
}

export async function resetPassword(rawEmail: string, code: string, newPassword: string, ip: string) {
  const email = normaliseEmail(rawEmail);
  if (!passwordPolicy.test(newPassword)) throw badRequest(passwordPolicy.message);
  await consumeEmailCode(email, "RESET", code);
  const user = await db.user.findUnique({ where: { email } });
  if (!user || user.status !== "ACTIVE" || user.deletedAt) throw badRequest("Code expired or not requested. Please request a new code.");
  const updated = await db.user.update({
    where: { id: user.id },
    // A new password signs out every other session. The code proves the email, so mark it verified.
    data: { passwordHash: await hashPassword(newPassword), sessionVersion: { increment: 1 }, emailVerifiedAt: user.emailVerifiedAt ?? new Date(), lastLoginAt: new Date() },
  });
  await audit({ id: user.id, role: user.role }, "user.password_reset", "User", user.id, { ip });
  return updated;
}
