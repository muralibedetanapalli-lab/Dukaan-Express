import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { badRequest, conflict, forbidden, notFound } from "@/server/errors";
import { hashPassword, passwordPolicy } from "@/server/auth/password";
import type { SessionUser } from "@/server/auth/session";
import { encryptField } from "@/server/crypto";
import { zPhone } from "@/server/http";
import { uploadPrivateDocument } from "@/server/integrations/storage";
import { audit } from "./audit";
import { assertVerifiedEmail, normaliseEmail } from "./auth";
import { regionFor } from "./dealer";
import { notifyAdmins, notifyUsers } from "./notification";
import { VEHICLES } from "./rider";

/**
 * Rider self-signup and verification (KYC).
 *  1. Anyone signs up in the Dukaan Rider app: name, mobile, verified email, password and an area
 *     (only areas that have at least one live shop are offered).
 *  2. They upload Aadhaar (number + front + back), driving licence and RC, then submit → PENDING.
 *  3. The dealer of their area or any admin approves (→ can go online and deliver) or rejects with a reason
 *     (the rider fixes and resubmits).
 * Documents are stored privately (see uploadPrivateDocument); the Aadhaar number is encrypted and shown masked.
 */

export const KYC_DOCS = ["aadhaarFront", "aadhaarBack", "license", "rc"] as const;
export type KycDoc = (typeof KYC_DOCS)[number];
const DOC_FIELD = { aadhaarFront: "aadhaarFrontRef", aadhaarBack: "aadhaarBackRef", license: "licenseRef", rc: "rcRef" } as const;
export const KYC_DOC_LABEL: Record<KycDoc, string> = {
  aadhaarFront: "Aadhaar card — front",
  aadhaarBack: "Aadhaar card — back",
  license: "Driving licence",
  rc: "Vehicle RC",
};

// ───────────────────────────── Areas ─────────────────────────────

/** Service areas with at least one live shop — the only areas riders can sign up for. */
export async function riderSignupAreas() {
  const [areas, shops] = await Promise.all([
    db.serviceArea.findMany({ where: { isActive: true }, orderBy: [{ state: "asc" }, { city: "asc" }], select: { id: true, city: true, state: true, pincodes: true } }),
    db.shop.findMany({ where: { deletedAt: null, isActive: true, approvalStatus: "APPROVED", address: { isNot: null } }, select: { address: { select: { city: true, pincode: true } } } }),
  ]);
  const counts = new Map<string, number>();
  for (const s of shops) {
    const r = regionFor(areas, s.address!);
    if (r) counts.set(r.id, (counts.get(r.id) ?? 0) + 1);
  }
  return areas.filter((a) => counts.has(a.id)).map((a) => ({ id: a.id, city: a.city, state: a.state, shops: counts.get(a.id)! }));
}

// ───────────────────────────── Signup ─────────────────────────────

export const zRiderSignup = z.object({
  name: z.string().trim().min(2).max(80),
  phone: zPhone,
  email: z.email().max(120),
  password: z.string().min(8).max(100),
  areaId: z.string().min(1),
  verificationToken: z.string().min(10),
});

export async function signupRider(input: z.infer<typeof zRiderSignup>, ip: string) {
  const email = normaliseEmail(input.email);
  await assertVerifiedEmail(email, input.verificationToken);
  if (!passwordPolicy.test(input.password)) throw badRequest(passwordPolicy.message);
  const areas = await riderSignupAreas();
  if (!areas.some((a) => a.id === input.areaId)) throw badRequest("Please choose one of the areas where we deliver");
  const area = await db.serviceArea.findUniqueOrThrow({ where: { id: input.areaId }, select: { id: true, city: true, dealerId: true } });

  const [byEmail, byPhone] = await Promise.all([db.user.findUnique({ where: { email }, select: { id: true } }), db.user.findUnique({ where: { phone: input.phone }, select: { id: true } })]);
  if (byEmail) throw conflict("An account with this email already exists. Please log in.");
  if (byPhone) throw conflict("This mobile number is already registered.");

  const user = await db.user
    .create({
      data: {
        role: "RIDER",
        name: input.name.trim(),
        email,
        phone: input.phone,
        passwordHash: await hashPassword(input.password),
        emailVerifiedAt: new Date(),
        lastLoginAt: new Date(),
        rider: { create: { serviceAreaId: area.id, dealerId: area.dealerId, kycStatus: "NOT_SUBMITTED" } },
      },
    })
    .catch((e: unknown) => {
      if (e && typeof e === "object" && "code" in e && e.code === "P2002") throw conflict("This email or mobile number is already registered");
      throw e;
    });
  await audit({ id: user.id, role: "RIDER" }, "rider.signup", "User", user.id, { ip, after: { area: area.city } });
  return user;
}

// ───────────────────────────── Documents ─────────────────────────────

function requireRiderId(user: SessionUser) {
  if (user.role !== "RIDER" || !user.riderId) throw forbidden();
  return user.riderId;
}

/** Upload one document photo (replaces the previous one). Allowed until approved. */
export async function saveKycDocument(user: SessionUser, doc: KycDoc, file: File) {
  const riderId = requireRiderId(user);
  const rider = await db.rider.findUniqueOrThrow({ where: { id: riderId } });
  if (rider.kycStatus === "APPROVED") throw conflict("Your documents are already approved");
  if (rider.kycStatus === "PENDING") throw conflict("Your documents are being reviewed. Wait for the result before changing them.");
  const ref = await uploadPrivateDocument(file, "rider-kyc");
  await db.rider.update({ where: { id: riderId }, data: { [DOC_FIELD[doc]]: ref } });
  await audit({ id: user.id, role: user.role }, "rider.kyc_document", "Rider", riderId, { after: { doc } });
  return { doc, uploaded: true };
}

/** Aadhaar: 12 digits, cannot start with 0 or 1, valid Verhoeff checksum. */
export function isValidAadhaar(n: string) {
  if (!/^[2-9]\d{11}$/.test(n)) return false;
  const d = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
  ];
  const p = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
  ];
  let c = 0;
  n.split("").reverse().forEach((ch, i) => (c = d[c][p[i % 8][Number(ch)]]));
  return c === 0;
}

export const zKycSubmit = z.object({
  aadhaarNumber: z
    .string()
    .transform((v) => v.replace(/\s|-/g, ""))
    .pipe(z.string().refine(isValidAadhaar, "Enter a valid 12-digit Aadhaar number")),
  licenseNumber: z.string().trim().toUpperCase().min(6, "Enter your driving licence number").max(20),
  vehicleType: z.enum(VEHICLES),
  vehicleNumber: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase().replace(/\s|-/g, ""))
    .pipe(z.string().regex(/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}$/, "Enter the vehicle number as on the RC, e.g. KA01AB1234")),
});

export async function submitKyc(user: SessionUser, input: z.infer<typeof zKycSubmit>) {
  const riderId = requireRiderId(user);
  const rider = await db.rider.findUniqueOrThrow({ where: { id: riderId }, include: { dealer: { select: { userId: true } }, serviceArea: { select: { city: true } } } });
  if (rider.kycStatus === "APPROVED") throw conflict("You are already approved");
  if (rider.kycStatus === "PENDING") throw conflict("Your documents are already submitted");
  const missing = KYC_DOCS.filter((d) => !rider[DOC_FIELD[d]]).map((d) => KYC_DOC_LABEL[d]);
  if (missing.length) throw badRequest(`Please upload: ${missing.join(", ")}`);
  await db.rider.update({
    where: { id: riderId },
    data: {
      aadhaarNumberEnc: encryptField(input.aadhaarNumber),
      aadhaarLast4: input.aadhaarNumber.slice(-4),
      licenseNumber: input.licenseNumber,
      vehicleType: input.vehicleType,
      vehicleNumber: input.vehicleNumber,
      kycStatus: "PENDING",
      kycSubmittedAt: new Date(),
      kycNote: null,
    },
  });
  await audit({ id: user.id, role: user.role }, "rider.kyc_submit", "Rider", riderId);
  const n = { type: "SHOP" as const, title: "New rider to verify", body: `${user.name ?? "A rider"} (${rider.serviceArea?.city ?? "no area"}) submitted documents`, link: "" };
  if (rider.dealer) await notifyUsers([rider.dealer.userId], { ...n, link: "/dealer/riders" });
  await notifyAdmins({ ...n, link: "/admin/riders" });
}

// ───────────────────────────── Review ─────────────────────────────

/** Dealer of the rider (or any admin) may see documents and decide. */
export async function reviewableRider(actor: SessionUser, riderId: string) {
  const rider = await db.rider.findUnique({ where: { id: riderId }, include: { user: true } });
  if (!rider) throw notFound("Rider");
  if (actor.role === "SUPER_ADMIN") return rider;
  if (actor.role === "DEALER" && actor.dealerId && rider.dealerId === actor.dealerId) return rider;
  if (actor.role === "RIDER" && actor.riderId === riderId) return rider;
  throw notFound("Rider");
}

export async function reviewKyc(actor: SessionUser, riderId: string, decision: { approve: true } | { approve: false; reason: string }) {
  if (actor.role !== "SUPER_ADMIN" && actor.role !== "DEALER") throw forbidden();
  const rider = await reviewableRider(actor, riderId);
  if (rider.kycStatus !== "PENDING") throw conflict(rider.kycStatus === "APPROVED" ? "Already approved" : "This rider hasn't submitted documents for review");
  const r = await db.rider.updateMany({
    where: { id: riderId, kycStatus: "PENDING" },
    data: decision.approve
      ? { kycStatus: "APPROVED", kycReviewedAt: new Date(), kycReviewedById: actor.id, kycNote: null }
      : { kycStatus: "REJECTED", kycReviewedAt: new Date(), kycReviewedById: actor.id, kycNote: decision.reason, isOnline: false },
  });
  if (r.count !== 1) throw conflict("Someone else just reviewed this rider");
  await audit({ id: actor.id, role: actor.role }, decision.approve ? "rider.kyc_approve" : "rider.kyc_reject", "Rider", riderId, { after: decision });
  await notifyUsers([rider.userId], decision.approve
    ? { type: "SHOP", title: "You're approved! 🎉", body: "Go online in the Dukaan Rider app to start getting deliveries.", link: "/rider" }
    : { type: "SHOP", title: "Documents need changes", body: decision.reason, link: "/rider" });
}
