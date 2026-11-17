import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import type { SessionUser } from "@/server/auth/session";
import { sendSignupCode, verifySignupCode } from "@/server/services/auth";
import { createDealer } from "@/server/services/dealer";
import { setOnline } from "@/server/services/rider";
import { isValidAadhaar, reviewKyc, riderSignupAreas, saveKycDocument, signupRider, submitKyc, zKycSubmit } from "@/server/services/rider-kyc";
import { fixture, resetDb } from "./helpers";

const asUser = (a: object) => a as unknown as SessionUser;
// A tiny valid PNG (1×1 px), so uploads pass the image sniffing.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const photo = () => new File([PNG], "doc.png", { type: "image/png" });

/** Make a valid Aadhaar by appending the Verhoeff check digit. */
function aadhaarWithCheck(first11: string) {
  for (let d = 0; d <= 9; d++) if (isValidAadhaar(first11 + d)) return first11 + d;
  throw new Error("no check digit");
}

async function verifiedToken(email: string) {
  const sent = await sendSignupCode(email);
  return (await verifySignupCode(email, sent.devCode!)).verificationToken;
}

describe("rider self-signup and verification", () => {
  beforeEach(resetDb);

  it("offers only areas with a live shop; signup → documents → dealer approval → can go online", async () => {
    const f = await fixture(); // live shop in Bengaluru 560034
    const blr = await db.serviceArea.create({ data: { city: "Bengaluru", state: "Karnataka", pincodes: ["560034"] } });
    await db.serviceArea.create({ data: { city: "Mysuru", state: "Karnataka", pincodes: ["570001"] } }); // no shops
    const { id: dealerId } = await createDealer(asUser(f.admin), { name: "Dev", email: "dev@d.in", phone: "9811100001", password: "Dealer@123", commissionShareBps: 2000, regionIds: [blr.id] });
    const dealer = await db.dealer.findUniqueOrThrow({ where: { id: dealerId } });

    const areas = await riderSignupAreas();
    expect(areas.map((a) => a.city)).toEqual(["Bengaluru"]);

    const base = { name: "Raju", phone: "9822200011", email: "raju@r.in", password: "Rider@123", areaId: blr.id };
    await expect(signupRider({ ...base, verificationToken: "nope" }, "ip")).rejects.toMatchObject({ status: 400 });
    const user = await signupRider({ ...base, verificationToken: await verifiedToken(base.email) }, "ip");
    const rider = await db.rider.findUniqueOrThrow({ where: { userId: user.id } });
    expect(rider).toMatchObject({ kycStatus: "NOT_SUBMITTED", dealerId, serviceAreaId: blr.id });
    const me = asUser({ id: user.id, role: "RIDER", name: "Raju", riderId: rider.id });

    // Can't work yet; can't submit without all four photos.
    await expect(setOnline(me, true)).rejects.toMatchObject({ status: 400 });
    const details = zKycSubmit.parse({ aadhaarNumber: aadhaarWithCheck("23456789012"), licenseNumber: "KA0120201234567", vehicleType: "BIKE", vehicleNumber: "ka 01 ab 1234" });
    await saveKycDocument(me, "aadhaarFront", photo());
    await expect(submitKyc(me, details)).rejects.toThrow(/Aadhaar card — back/);
    for (const d of ["aadhaarBack", "license", "rc"] as const) await saveKycDocument(me, d, photo());
    await submitKyc(me, details);
    const pending = await db.rider.findUniqueOrThrow({ where: { id: rider.id } });
    expect(pending).toMatchObject({ kycStatus: "PENDING", aadhaarLast4: details.aadhaarNumber.slice(-4), vehicleNumber: "KA01AB1234" });
    expect(pending.aadhaarNumberEnc).not.toContain(details.aadhaarNumber); // encrypted at rest
    expect(pending.aadhaarFrontRef).toMatch(/^local:rider-kyc\//); // private storage, not a public URL
    await expect(saveKycDocument(me, "rc", photo())).rejects.toMatchObject({ status: 409 }); // locked while in review

    // Another dealer can't review; this rider's dealer rejects, rider fixes, dealer approves.
    const { id: otherId } = await createDealer(asUser(f.admin), { name: "Other", email: "o@d.in", phone: "9811100002", password: "Dealer@123", commissionShareBps: 2000, regionIds: [] });
    const other = await db.dealer.findUniqueOrThrow({ where: { id: otherId } });
    await expect(reviewKyc(asUser({ id: other.userId, role: "DEALER", dealerId: otherId }), rider.id, { approve: true })).rejects.toMatchObject({ status: 404 });
    const dealerUser = asUser({ id: dealer.userId, role: "DEALER", dealerId });
    await reviewKyc(dealerUser, rider.id, { approve: false, reason: "Licence photo is blurry" });
    expect(await db.rider.findUniqueOrThrow({ where: { id: rider.id } })).toMatchObject({ kycStatus: "REJECTED", kycNote: "Licence photo is blurry" });
    await saveKycDocument(me, "license", photo());
    await submitKyc(me, details);
    await reviewKyc(dealerUser, rider.id, { approve: true });
    await expect(reviewKyc(asUser(f.admin), rider.id, { approve: true })).rejects.toMatchObject({ status: 409 }); // already decided

    await expect(setOnline(me, true)).resolves.toEqual({ online: true });
  });

  it("validates Aadhaar numbers and lets an admin approve riders in areas without a dealer", async () => {
    expect(isValidAadhaar("123456789012")).toBe(false); // can't start with 1
    expect(isValidAadhaar(aadhaarWithCheck("23456789012"))).toBe(true);
    const good = aadhaarWithCheck("98765432109");
    expect(isValidAadhaar(good.slice(0, 11) + ((Number(good[11]) + 1) % 10))).toBe(false); // wrong check digit

    const f = await fixture();
    const blr = await db.serviceArea.create({ data: { city: "Bengaluru", state: "Karnataka", pincodes: [] } }); // city match
    const user = await signupRider({ name: "Asha", phone: "9822200012", email: "asha@r.in", password: "Rider@123", areaId: blr.id, verificationToken: await verifiedToken("asha@r.in") }, "ip");
    const rider = await db.rider.findUniqueOrThrow({ where: { userId: user.id } });
    expect(rider.dealerId).toBeNull();
    const me = asUser({ id: user.id, role: "RIDER", name: "Asha", riderId: rider.id });
    for (const d of ["aadhaarFront", "aadhaarBack", "license", "rc"] as const) await saveKycDocument(me, d, photo());
    await submitKyc(me, zKycSubmit.parse({ aadhaarNumber: good, licenseNumber: "KA0120209999999", vehicleType: "SCOOTER", vehicleNumber: "KA05XY9" }));
    await reviewKyc(asUser(f.admin), rider.id, { approve: true });
    expect((await db.rider.findUniqueOrThrow({ where: { id: rider.id } })).kycStatus).toBe("APPROVED");

    // Same email or phone can't sign up twice; an area without live shops is refused.
    await expect(
      signupRider({ name: "Asha", phone: "9822200013", email: "asha@r.in", password: "Rider@123", areaId: blr.id, verificationToken: await verifiedToken("asha2@r.in") }, "ip"),
    ).rejects.toMatchObject({ status: 400 }); // token is for another email
    const empty = await db.serviceArea.create({ data: { city: "Hubli", state: "Karnataka", pincodes: ["580020"] } });
    await expect(
      signupRider({ name: "Ravi", phone: "9822200014", email: "ravi@r.in", password: "Rider@123", areaId: empty.id, verificationToken: await verifiedToken("ravi@r.in") }, "ip"),
    ).rejects.toMatchObject({ status: 400 });
  });
});
