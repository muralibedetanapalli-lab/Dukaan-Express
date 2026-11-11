import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import type { SessionUser } from "@/server/auth/session";
import { addToCart } from "@/server/services/cart";
import { placeOrder, transitionOrder } from "@/server/services/order";
import { createShipmentForOrder, simulateNextCourierEvent } from "@/server/services/shipment";
import {
  cancelPayout,
  getBankAccount,
  markSettlementPaid,
  payoutOverview,
  rejectPayout,
  requestPayout,
  revealBankAccount,
  saveBankAccount,
  zBankInput,
} from "@/server/services/payout";
import { fixture, resetDb } from "./helpers";

type F = Awaited<ReturnType<typeof fixture>>;
const asUser = (a: { id: string; role: string }) => a as unknown as SessionUser;

/** Place a COD order for ₹540 of items and drive it to DELIVERED (10% commission → shop earns ₹486). */
async function deliveredOrder(f: F) {
  await addToCart(f.customer.customerId, f.inv1.id, 2, false);
  const order = await placeOrder(f.customer, { addressId: f.customer.addressId, paymentMethod: "COD" });
  for (const to of ["SHOP_ACCEPTED", "PREPARING", "READY_FOR_PACKING", "PACKED"] as const) await transitionOrder(order.id, to, f.owner);
  await createShipmentForOrder(order.id, f.owner);
  for (let i = 0; i < 4; i++) await simulateNextCourierEvent(order.id);
  return order;
}

const BANK = { accountHolderName: "Ravi Kumar", accountNumber: "50100123456789", ifsc: "hdfc0001234", bankName: "HDFC Bank", upiId: "" };

describe("shop payouts (integration)", () => {
  beforeEach(resetDb);

  it("validates and encrypts bank details; only the last 4 digits are exposed", async () => {
    const f = await fixture();
    expect(zBankInput.safeParse({ ...BANK, ifsc: "HDFC1234" }).success).toBe(false);
    expect(zBankInput.safeParse({ ...BANK, accountNumber: "12ab" }).success).toBe(false);

    const view = await saveBankAccount(asUser(f.owner), f.shop.id, zBankInput.parse(BANK));
    expect(view).toMatchObject({ accountNumberMasked: "•••• 6789", ifsc: "HDFC0001234", upiId: null });
    const row = await db.shopBankAccount.findUniqueOrThrow({ where: { shopId: f.shop.id } });
    expect(row.accountNumberEnc).not.toContain("50100123456789");
    expect((await revealBankAccount(f.shop.id))?.accountNumber).toBe("50100123456789");
    expect(JSON.stringify(await getBankAccount(f.shop.id))).not.toContain("50100123456789");
  });

  it("owner sees earnings after commission, requests a payout, admin records the transfer", async () => {
    const f = await fixture();
    await deliveredOrder(f);

    let o = await payoutOverview(f.shop.id);
    expect(o.available).toEqual({ orders: 1, gross: 54000, commission: 5400, net: 48600 });

    await expect(requestPayout(asUser(f.owner), f.shop.id)).rejects.toThrow(/bank account/i);
    await saveBankAccount(asUser(f.owner), f.shop.id, zBankInput.parse(BANK));

    const p = await requestPayout(asUser(f.owner), f.shop.id);
    expect(p).toMatchObject({ status: "PENDING", requestedBy: "SHOP", netPayable: 48600, orderCount: 1, commissionAmount: 5400 });
    expect(p.bankSnapshot).toMatchObject({ accountLast4: "6789", ifsc: "HDFC0001234" });
    expect(await db.notification.count({ where: { userId: f.admin.id, type: "PAYOUT" } })).toBe(1);

    o = await payoutOverview(f.shop.id);
    expect(o.available.net).toBe(0);
    expect(o.open?.id).toBe(p.id);

    // One open request at a time, and bank details are locked meanwhile.
    await expect(requestPayout(asUser(f.owner), f.shop.id)).rejects.toThrow(/already/i);
    await expect(saveBankAccount(asUser(f.owner), f.shop.id, zBankInput.parse(BANK))).rejects.toThrow(/in progress/i);

    const paid = await markSettlementPaid(asUser(f.admin), p.id, {
      reference: "431512345678",
      payoutMethod: "IMPS",
      proofUrl: "https://res.cloudinary.com/demo/image/upload/receipt.png",
      notes: "Weekly payout",
    });
    expect(paid).toMatchObject({ status: "PAID", reference: "431512345678", payoutMethod: "IMPS" });
    expect(paid.paidAt).toBeInstanceOf(Date);
    await expect(markSettlementPaid(asUser(f.admin), p.id, { reference: "again", payoutMethod: "IMPS" })).rejects.toThrow(/already/i);

    o = await payoutOverview(f.shop.id);
    expect(o.paidOut).toBe(48600);
    expect(o.open).toBeNull();
    expect(o.payouts[0]).toMatchObject({ status: "PAID", proofUrl: expect.stringContaining("receipt") });
    expect(await db.notification.count({ where: { userId: f.owner.id, type: "PAYOUT" } })).toBe(1);
  });

  it("declined or cancelled requests return the orders to the available balance", async () => {
    const f = await fixture();
    await deliveredOrder(f);
    await saveBankAccount(asUser(f.owner), f.shop.id, zBankInput.parse(BANK));

    const p1 = await requestPayout(asUser(f.owner), f.shop.id);
    await rejectPayout(asUser(f.admin), p1.id, "Account name does not match");
    let o = await payoutOverview(f.shop.id);
    expect(o.available.net).toBe(48600);
    expect(o.payouts.find((x) => x.id === p1.id)).toMatchObject({ status: "REJECTED", rejectionReason: "Account name does not match" });
    await expect(markSettlementPaid(asUser(f.admin), p1.id, { reference: "x12345", payoutMethod: "NEFT" })).rejects.toThrow(/rejected/i);

    const p2 = await requestPayout(asUser(f.owner), f.shop.id);
    await cancelPayout(asUser(f.owner), f.shop.id, p2.id);
    o = await payoutOverview(f.shop.id);
    expect(o.available.net).toBe(48600);
    expect(o.open).toBeNull();

    // Another shop can't cancel this one's request.
    const p3 = await requestPayout(asUser(f.owner), f.shop.id);
    await expect(cancelPayout(asUser(f.owner), "some-other-shop", p3.id)).rejects.toThrow(/not found/i);
  });

  it("concurrent requests create only one payout", async () => {
    const f = await fixture();
    await deliveredOrder(f);
    await saveBankAccount(asUser(f.owner), f.shop.id, zBankInput.parse(BANK));
    const results = await Promise.allSettled([requestPayout(asUser(f.owner), f.shop.id), requestPayout(asUser(f.owner), f.shop.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.shopSettlement.count({ where: { shopId: f.shop.id } })).toBe(1);
  });
});
