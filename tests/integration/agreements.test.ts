import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import type { SessionUser } from "@/server/auth/session";
import { createDealer, dealerOnboardShop, zDealerShopInput } from "@/server/services/dealer";
import { setShopActive } from "@/server/services/admin";
import { acceptAgreement, agreementForToken, agreementPdfFor, resendAgreement, sendAgreementCode } from "@/server/services/agreement";
import { createRider } from "@/server/services/rider";
import { decryptField } from "@/server/crypto";
import { fixture, resetDb } from "./helpers";

const asUser = (a: Partial<SessionUser> & { id: string; role: string }) => a as unknown as SessionUser;
const tokenOf = (link?: string) => link!.split("/agreement/")[1];
const meta = { ip: "203.0.113.7", userAgent: "vitest" };

async function onboard() {
  const f = await fixture();
  const { id: dealerId } = await createDealer(asUser(f.admin), {
    name: "Dee",
    email: "dee@dealer.in",
    phone: "9811100055",
    password: "Dealer@123",
    commissionShareBps: 2000,
    regionIds: [],
  });
  const d = await db.dealer.findUniqueOrThrow({ where: { id: dealerId } });
  const dealer = asUser({
    id: d.userId,
    role: "DEALER",
    name: "Dee",
    dealerId,
  });
  const r = await dealerOnboardShop(
    dealer,
    zDealerShopInput.parse({
      name: "Sign Kirana",
      contactPhone: "9822200091",
      deliveryRadiusKm: 4,
      avgPrepMinutes: 10,
      deliveryMode: "SELF_BOOKED",
      address: {
        line1: "1 Test Road",
        city: "Bengaluru",
        state: "Karnataka",
        pincode: "560034",
        latitude: 12.93,
        longitude: 77.62,
      },
      owner: {
        name: "Sita",
        email: "sita@shop.in",
        phone: "9822200092",
        password: "Owner@123",
      },
    }),
  );
  return { f, dealer, shopId: r.id, token: tokenOf(r.agreement?.devLink) };
}

describe("seller agreements", () => {
  beforeEach(resetDb);

  it("onboarding emails an agreement; signing with the email code activates the shop", async () => {
    const { f, shopId, token } = await onboard();
    expect(token).toBeTruthy();
    const view = await agreementForToken(token);
    expect(view.status).toBe("PENDING");
    expect(view.terms.shop.name).toBe("Sign Kirana");
    expect(view.terms.commercial.deliveryMode).toMatch(/Booked by shop/);
    expect(view.email).toBe("si**@shop.in");

    // The admin can't switch it on before the owner signs.
    await expect(setShopActive(asUser(f.admin), shopId, true)).rejects.toMatchObject({ status: 400 });

    // The owner's login details wait (encrypted) for the shop to go live.
    const ownerBefore = await db.user.findUniqueOrThrow({ where: { email: "sita@shop.in" } });
    expect(ownerBefore.welcomeSentAt).toBeNull();
    expect(decryptField(ownerBefore.welcomeSecret!)).toBe("Owner@123");

    const { devCode } = await sendAgreementCode(token);
    expect(devCode).toMatch(/^\d{6}$/);
    const wrong = devCode === "000000" ? "111111" : "000000";
    await expect(acceptAgreement(token, { name: "Sita Devi", code: wrong }, meta)).rejects.toMatchObject({ status: 400 });
    expect(await acceptAgreement(token, { name: "Sita Devi", code: devCode! }, meta)).toEqual({ signed: true, activated: true });

    const shop = await db.shop.findUniqueOrThrow({
      where: { id: shopId },
      include: { owner: { include: { user: true } } },
    });
    expect(shop.isActive).toBe(true);
    expect(shop.agreementAcceptedAt).not.toBeNull();
    expect(shop.owner?.user.emailVerifiedAt).not.toBeNull();
    // Signed and live → welcome sent, held password erased.
    expect(shop.owner?.user.welcomeSentAt).not.toBeNull();
    expect(shop.owner?.user.welcomeSecret).toBeNull();
    const ag = await db.shopAgreement.findFirstOrThrow({ where: { shopId } });
    expect(ag).toMatchObject({
      status: "ACCEPTED",
      acceptedName: "Sita Devi",
      acceptedIp: "203.0.113.7",
    });

    // Signing twice is refused; the signed PDF is available to the admin.
    await expect(acceptAgreement(token, { name: "Sita Devi", code: devCode! }, meta)).rejects.toMatchObject({ status: 400 });
    const { pdf, filename } = await agreementPdfFor(asUser(f.admin), shopId);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(filename).toMatch(/-signed\.pdf$/);
  });

  it("resending voids the old link; only the shop's dealer, owner or admin can resend", async () => {
    const { f, dealer, shopId, token } = await onboard();
    await db.shopAgreement.updateMany({
      where: { shopId },
      data: { sentAt: new Date(Date.now() - 120_000) },
    }); // past the resend cooldown
    const again = await resendAgreement(dealer, shopId);
    const fresh = tokenOf(again.devLink);
    expect(fresh).not.toBe(token);
    expect((await agreementForToken(token)).status).toBe("VOID");
    await expect(sendAgreementCode(token)).rejects.toMatchObject({
      status: 400,
    });
    expect((await agreementForToken(fresh)).status).toBe("PENDING");

    const other = await createDealer(asUser(f.admin), {
      name: "Other",
      email: "o@dealer.in",
      phone: "9811100056",
      password: "Dealer@123",
      commissionShareBps: 2000,
      regionIds: [],
    });
    const od = await db.dealer.findUniqueOrThrow({ where: { id: other.id } });
    await expect(resendAgreement(asUser({ id: od.userId, role: "DEALER", dealerId: od.id }), shopId)).rejects.toMatchObject({ status: 403 });
    await expect(agreementForToken("not-a-real-token-but-long-enough")).rejects.toMatchObject({ status: 404 });
  });

  it("dealers and riders added by staff get their welcome right away", async () => {
    const { dealer } = await onboard();
    const d = await db.user.findUniqueOrThrow({ where: { id: dealer.id } });
    expect(d.welcomeSentAt).not.toBeNull();
    expect(d.welcomeSecret).toBeNull();

    const r = await createRider(dealer, {
      name: "Ravi Rider",
      email: "ravi@rider.in",
      phone: "9822200093",
      password: null,
      vehicleType: "BIKE",
      vehicleNumber: null,
    });
    const ru = await db.rider.findUniqueOrThrow({ where: { id: r.id }, include: { user: true } });
    expect(r.temporaryPassword).toBeTruthy();
    expect(ru.user.welcomeSentAt).not.toBeNull();
    expect(ru.user.welcomeSecret).toBeNull();
  });
});
