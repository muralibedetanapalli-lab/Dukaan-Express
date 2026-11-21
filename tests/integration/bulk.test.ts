import { beforeEach, describe, expect, it, vi } from "vitest";

// activeShopFor reads the "active shop" cookie; outside a request there is none.
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined }) }));

import { db } from "@/server/db";
import type { SessionUser } from "@/server/auth/session";
import { createDealer, assignShopDealer } from "@/server/services/dealer";
import { availableBalance } from "@/server/services/payout";
import {
  buyerBulkAction,
  expireUnpaidBulkOrders,
  placeBulkOrder,
  sellerBulkAction,
  setBulkPrices,
  startBulkPayment,
  updateBulkSettings,
  verifyBulkPayment,
  wholesalerCatalog,
  wholesalers,
} from "@/server/services/bulk";
import { fixture, resetDb } from "./helpers";

const asUser = (a: Partial<SessionUser> & { id: string; role: string }) => a as unknown as SessionUser;

/** Test Mart (fixture) sells in bulk; Corner Store buys. */
async function setup() {
  const f = await fixture({ stock: 100 });
  const seller = asUser(f.owner);
  const bu = await db.user.create({
    data: { role: "SHOP_OWNER", name: "Buyer", email: "buyer@shop.in", phone: "9845000099", passwordHash: "x", shopOwner: { create: {} } },
    include: { shopOwner: true },
  });
  const buyerShop = await db.shop.create({
    data: {
      name: "Corner Store",
      slug: "corner-store",
      ownerId: bu.shopOwner!.id,
      contactPhone: "9845000098",
      approvalStatus: "APPROVED",
      isActive: true,
      agreementAcceptedAt: new Date(),
      address: { create: { line1: "1 HSR Layout", city: "Bengaluru", state: "Karnataka", pincode: "560102", latitude: 12.91, longitude: 77.64 } },
    },
  });
  const buyer = asUser({ id: bu.id, role: "SHOP_OWNER", shopOwnerId: bu.shopOwner!.id });
  await updateBulkSettings(seller, {
    sellsBulk: true,
    bulkMinOrder: 100_000,
    bulkDelivers: true,
    bulkDeliveryFee: 5000,
    bulkPickup: true,
    bulkPayOnDelivery: true,
  });
  await setBulkPrices(seller, { items: [{ inventoryId: f.inv1.id, bulkPrice: 24000, bulkMinQty: 10 }] });
  return { f, seller, buyer, buyerShop };
}

describe("bulk (B2B) orders", () => {
  beforeEach(resetDb);

  it("lists wholesalers and their bulk catalogue, and validates orders", async () => {
    const { f, buyer, buyerShop } = await setup();
    const list = await wholesalers(buyerShop.id);
    expect(list.map((w) => w.name)).toEqual(["Test Mart"]);
    expect(list[0].products).toBe(1);
    const cat = await wholesalerCatalog(buyerShop.id, f.shop.id);
    expect(cat.items).toMatchObject([{ inventoryId: f.inv1.id, bulkPrice: 24000, minQty: 10 }]);
    await expect(wholesalerCatalog(f.shop.id, f.shop.id)).rejects.toMatchObject({ status: 400 });

    const base = { sellerShopId: f.shop.id, fulfilment: "PICKUP" as const, paymentMethod: "ON_DELIVERY" as const };
    await expect(placeBulkOrder(buyer, { ...base, items: [{ inventoryId: f.inv1.id, quantity: 5 }] })).rejects.toMatchObject({ status: 400 }); // below min qty
    await expect(placeBulkOrder(buyer, { ...base, items: [{ inventoryId: f.inv2.id, quantity: 10 }] })).rejects.toMatchObject({ status: 409 }); // not sold in bulk
    await expect(placeBulkOrder(buyer, { ...base, items: [{ inventoryId: f.inv1.id, quantity: 500 }] })).rejects.toMatchObject({ status: 409 }); // stock
    await db.shop.update({ where: { id: f.shop.id }, data: { bulkMinOrder: 1_000_000 } });
    await expect(placeBulkOrder(buyer, { ...base, items: [{ inventoryId: f.inv1.id, quantity: 10 }] })).rejects.toMatchObject({ status: 400 }); // min order value
  });

  it("pay on pickup: stock reserved on accept; the seller's balance is charged the B2B commission and the dealer gets a share", async () => {
    const { f, seller, buyer } = await setup();
    const { id: dealerId } = await createDealer(asUser(f.admin), {
      name: "D",
      email: "d@d.in",
      phone: "9811100077",
      password: "Dealer@123",
      commissionShareBps: 2000,
      regionIds: [],
    });
    await assignShopDealer(asUser(f.admin), f.shop.id, dealerId);

    const o = await placeBulkOrder(buyer, {
      sellerShopId: f.shop.id,
      fulfilment: "PICKUP",
      paymentMethod: "ON_DELIVERY",
      items: [{ inventoryId: f.inv1.id, quantity: 10 }],
    });
    expect(o).toMatchObject({ status: "PLACED", total: 240_000 });
    await expect(sellerBulkAction(seller, o.id, { action: "dispatch" })).rejects.toMatchObject({ status: 400 }); // pickup order
    await sellerBulkAction(seller, o.id, { action: "accept" });
    expect((await db.shopInventory.findUniqueOrThrow({ where: { id: f.inv1.id } })).stock).toBe(90);
    await sellerBulkAction(seller, o.id, { action: "ready" });
    await buyerBulkAction(buyer, o.id, { action: "received" });

    const done = await db.bulkOrder.findUniqueOrThrow({ where: { id: o.id }, include: { commission: true } });
    expect(done).toMatchObject({ status: "DELIVERED", paymentStatus: "CAPTURED" });
    // 5% default B2B rate on ₹2,400 = ₹120, owed by the seller (they collected the cash); dealer gets 20% of it.
    expect(done.commission).toMatchObject({ baseAmount: 240_000, rateBps: 500, amount: 12_000, shopEarning: -12_000, dealerId, dealerAmount: 2_400 });
    expect((await availableBalance(f.shop.id)).net).toBe(-12_000);
  });

  it("online + delivery: paid before the seller sees it; seller earns items − commission + delivery; rejection refunds", async () => {
    const { f, seller, buyer } = await setup();
    const o = await placeBulkOrder(buyer, {
      sellerShopId: f.shop.id,
      fulfilment: "DELIVERY",
      paymentMethod: "ONLINE",
      items: [{ inventoryId: f.inv1.id, quantity: 10 }],
    });
    expect(o).toMatchObject({ status: "PAYMENT_PENDING", total: 245_000 });
    await expect(sellerBulkAction(seller, o.id, { action: "accept" })).rejects.toMatchObject({ status: 409 }); // unpaid
    const checkout = await startBulkPayment(buyer, o.id);
    expect(checkout).toMatchObject({ mode: "sandbox", amount: 245_000 });
    expect(await verifyBulkPayment(buyer, o.id, { gatewayOrderId: checkout.gatewayOrderId, sandboxOutcome: "success" })).toEqual({ outcome: "paid" });
    expect((await db.bulkOrder.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("PLACED");

    await sellerBulkAction(seller, o.id, { action: "accept" });
    await sellerBulkAction(seller, o.id, { action: "dispatch" });
    await sellerBulkAction(seller, o.id, { action: "delivered" });
    const c = await db.commission.findUniqueOrThrow({ where: { bulkOrderId: o.id } });
    expect(c).toMatchObject({ amount: 12_000, shopEarning: 240_000 - 12_000 + 5_000 });

    // A second paid order rejected by the seller is refunded (sandbox refunds settle immediately).
    const o2 = await placeBulkOrder(buyer, {
      sellerShopId: f.shop.id,
      fulfilment: "DELIVERY",
      paymentMethod: "ONLINE",
      items: [{ inventoryId: f.inv1.id, quantity: 10 }],
    });
    const c2 = await startBulkPayment(buyer, o2.id);
    await verifyBulkPayment(buyer, o2.id, { gatewayOrderId: c2.gatewayOrderId, sandboxOutcome: "success" });
    await sellerBulkAction(seller, o2.id, { action: "reject", reason: "Out of stock today" });
    expect(await db.bulkOrder.findUniqueOrThrow({ where: { id: o2.id } })).toMatchObject({
      status: "REJECTED",
      paymentStatus: "REFUNDED",
      refundStatus: "SUCCESS",
    });
    expect((await db.shopInventory.findUniqueOrThrow({ where: { id: f.inv1.id } })).stock).toBe(90); // only the accepted order took stock
  });

  it("seller cancelling an accepted order restores stock; unpaid orders expire; outsiders can't act", async () => {
    const { f, seller, buyer } = await setup();
    const o = await placeBulkOrder(buyer, {
      sellerShopId: f.shop.id,
      fulfilment: "PICKUP",
      paymentMethod: "ON_DELIVERY",
      items: [{ inventoryId: f.inv1.id, quantity: 20 }],
    });
    await expect(sellerBulkAction(buyer, o.id, { action: "accept" })).rejects.toMatchObject({ status: 404 }); // buyer isn't the seller
    await sellerBulkAction(seller, o.id, { action: "accept" });
    await expect(buyerBulkAction(buyer, o.id, { action: "cancel" })).rejects.toMatchObject({ status: 409 }); // too late for the buyer
    await sellerBulkAction(seller, o.id, { action: "cancel", reason: "Supplier delay" });
    expect((await db.shopInventory.findUniqueOrThrow({ where: { id: f.inv1.id } })).stock).toBe(100);

    const unpaid = await placeBulkOrder(buyer, {
      sellerShopId: f.shop.id,
      fulfilment: "PICKUP",
      paymentMethod: "ONLINE",
      items: [{ inventoryId: f.inv1.id, quantity: 10 }],
    });
    await db.bulkOrder.update({ where: { id: unpaid.id }, data: { createdAt: new Date(Date.now() - 3 * 3600_000) } });
    expect(await expireUnpaidBulkOrders()).toBe(1);
    expect((await db.bulkOrder.findUniqueOrThrow({ where: { id: unpaid.id } })).status).toBe("CANCELLED");
  });
});
