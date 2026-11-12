import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import type { SessionUser } from "@/server/auth/session";
import { addToCart } from "@/server/services/cart";
import { placeOrder, transitionOrder } from "@/server/services/order";
import { createShipmentForOrder, simulateNextCourierEvent } from "@/server/services/shipment";
import { markSettlementPaid, requestPayout, saveBankAccount, zBankInput } from "@/server/services/payout";
import {
  assignShopDealer,
  createDealer,
  dealerBalance,
  dealerOnboardShop,
  markDealerPayoutPaid,
  requestDealerPayout,
  reviewShopPayout,
  saveDealerBank,
  updateDealer,
  zDealerShopInput,
} from "@/server/services/dealer";
import { fixture, resetDb } from "./helpers";

type F = Awaited<ReturnType<typeof fixture>>;
const asUser = (a: Partial<SessionUser> & { id: string; role: string }) => a as unknown as SessionUser;
const BANK = { accountHolderName: "Ravi Kumar", accountNumber: "50100123456789", ifsc: "HDFC0001234", bankName: "HDFC Bank", upiId: "" };

async function deliveredOrder(f: F) {
  await addToCart(f.customer.customerId, f.inv1.id, 2, false);
  const order = await placeOrder(f.customer, { addressId: f.customer.addressId, paymentMethod: "COD" });
  for (const to of ["SHOP_ACCEPTED", "PREPARING", "READY_FOR_PACKING", "PACKED"] as const) await transitionOrder(order.id, to, f.owner);
  await createShipmentForOrder(order.id, f.owner);
  for (let i = 0; i < 4; i++) await simulateNextCourierEvent(order.id);
  return order;
}

/** Bengaluru region + a dealer holding it with a 25% share of platform commission. */
async function dealerSetup(f: F) {
  const blr = await db.serviceArea.create({ data: { city: "Bengaluru", state: "Karnataka", pincodes: ["560034", "560095"] } });
  const mys = await db.serviceArea.create({ data: { city: "Mysuru", state: "Karnataka", pincodes: [] } });
  const { id: dealerId } = await createDealer(asUser(f.admin), {
    name: "Dealer Dev",
    email: "dev@dealer.in",
    phone: "9811100001",
    password: "Dealer@123",
    commissionShareBps: 2500,
    regionIds: [blr.id],
  });
  const d = await db.dealer.findUniqueOrThrow({ where: { id: dealerId }, include: { user: true } });
  const actor = asUser({ id: d.userId, role: "DEALER", name: "Dealer Dev", dealerId });
  return { blr, mys, dealerId, actor };
}

describe("dealers (integration)", () => {
  beforeEach(resetDb);

  it("one dealer per region; dealers onboard live shops only inside their regions", async () => {
    const f = await fixture();
    const { blr, mys, actor } = await dealerSetup(f);

    // Another dealer cannot take Bengaluru while it is held.
    await expect(
      createDealer(asUser(f.admin), { name: "Other", email: "o@dealer.in", phone: "9811100002", password: "Dealer@123", commissionShareBps: 1000, regionIds: [blr.id] }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await db.user.count({ where: { role: "DEALER" } })).toBe(1); // the failed create rolled back

    const base = {
      name: "Corner Kirana",
      contactPhone: "9822200001",
      deliveryRadiusKm: 4,
      avgPrepMinutes: 10,
      address: { line1: "12 Main Road", city: "Bengaluru", state: "Karnataka", pincode: "560034", latitude: 12.93, longitude: 77.62 },
      owner: { name: "Kiran", email: "kiran@shop.in", phone: "9822200002", password: "Owner@123" },
    };
    // Outside the region (pincode not listed) → refused.
    await expect(dealerOnboardShop(actor, zDealerShopInput.parse({ ...base, address: { ...base.address, pincode: "560001" } }))).rejects.toMatchObject({ status: 400 });

    const r = await dealerOnboardShop(actor, zDealerShopInput.parse(base));
    const shop = await db.shop.findUniqueOrThrow({ where: { id: r.id }, include: { owner: { include: { user: true } } } });
    expect(shop).toMatchObject({ dealerId: actor.dealerId, approvalStatus: "APPROVED", isActive: true, commissionBps: null });
    expect(shop.owner?.user).toMatchObject({ role: "SHOP_OWNER", email: "kiran@shop.in" });

    // City-only region (no pincodes) matches on city name once assigned.
    await updateDealer(asUser(f.admin), actor.dealerId!, { regionIds: [blr.id, mys.id] });
    const r2 = await dealerOnboardShop(
      actor,
      zDealerShopInput.parse({ ...base, name: "Mysuru Mart", address: { ...base.address, city: "mysuru", pincode: "570001" }, owner: { ...base.owner, email: "m@shop.in", phone: "9822200003" } }),
    );
    expect(r2.id).toBeTruthy();
  });

  it("shop payout → dealer approves → admin pays; dealer earns their share of commission", async () => {
    const f = await fixture();
    const { actor, dealerId } = await dealerSetup(f);
    await assignShopDealer(asUser(f.admin), f.shop.id, dealerId);
    await deliveredOrder(f); // ₹540 items, 10% commission = ₹54 → dealer 25% = ₹13.50

    const c = await db.commission.findFirstOrThrow({ where: { shopId: f.shop.id } });
    expect(c).toMatchObject({ amount: 5400, dealerId, dealerAmount: 1350 });

    await saveBankAccount(asUser(f.owner), f.shop.id, zBankInput.parse(BANK));
    const p = await requestPayout(asUser(f.owner), f.shop.id);
    expect(p).toMatchObject({ status: "DEALER_REVIEW", dealerId });

    // Admin can't pay before the dealer approves; another dealer can't review it.
    await expect(markSettlementPaid(asUser(f.admin), p.id, { reference: "UTR1", payoutMethod: "IMPS" })).rejects.toMatchObject({ status: 409 });
    await expect(reviewShopPayout(asUser({ id: "x", role: "DEALER", dealerId: "other" }), p.id, { approve: true })).rejects.toMatchObject({ status: 404 });

    const approved = await reviewShopPayout(actor, p.id, { approve: true, note: "Checked with owner" });
    expect(approved).toMatchObject({ status: "PENDING", dealerNote: "Checked with owner" });
    expect(approved.dealerReviewedAt).toBeInstanceOf(Date);
    const paid = await markSettlementPaid(asUser(f.admin), p.id, { reference: "UTR123", payoutMethod: "IMPS" });
    expect(paid.status).toBe("PAID");

    // Dealer commission payout.
    expect(await dealerBalance(dealerId)).toEqual({ orders: 1, amount: 1350 });
    await expect(requestDealerPayout(actor)).rejects.toThrow(/bank account/i);
    await saveDealerBank(actor, zBankInput.parse(BANK));
    const dp = await requestDealerPayout(actor);
    expect(dp).toMatchObject({ amount: 1350, orderCount: 1, status: "PENDING" });
    expect(await dealerBalance(dealerId)).toEqual({ orders: 0, amount: 0 });
    await expect(requestDealerPayout(actor)).rejects.toMatchObject({ status: 409 });
    expect((await markDealerPayoutPaid(asUser(f.admin), dp.id, { reference: "UTR9", payoutMethod: "UPI" })).status).toBe("PAID");
  });

  it("dealer decline releases orders; removing the dealer sends waiting payouts to the admin", async () => {
    const f = await fixture();
    const { actor, dealerId } = await dealerSetup(f);
    await assignShopDealer(asUser(f.admin), f.shop.id, dealerId);
    await deliveredOrder(f);
    await saveBankAccount(asUser(f.owner), f.shop.id, zBankInput.parse(BANK));

    const p1 = await requestPayout(asUser(f.owner), f.shop.id);
    await expect(reviewShopPayout(actor, p1.id, { approve: false, reason: "Bank name mismatch" })).resolves.toMatchObject({ status: "REJECTED" });
    expect(await db.commission.count({ where: { shopId: f.shop.id, settlementId: null } })).toBe(1);

    const p2 = await requestPayout(asUser(f.owner), f.shop.id);
    expect(p2.status).toBe("DEALER_REVIEW");
    await assignShopDealer(asUser(f.admin), f.shop.id, null);
    expect(await db.shopSettlement.findUniqueOrThrow({ where: { id: p2.id } })).toMatchObject({ status: "PENDING", dealerId: null });

    // Orders delivered after the dealer was removed earn the dealer nothing.
    await deliveredOrder(f);
    const latest = await db.commission.findFirstOrThrow({ where: { shopId: f.shop.id, settlementId: null } });
    expect(latest).toMatchObject({ dealerId: null, dealerAmount: 0 });
  });
});
