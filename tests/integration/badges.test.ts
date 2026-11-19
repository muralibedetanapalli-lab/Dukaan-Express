import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { addToCart } from "@/server/services/cart";
import { placeOrder, transitionOrder } from "@/server/services/order";
import { awardMonth, currentHolders, currentPeriod, previousPeriod, rangeOf, riderLeaderboards, riderStar, shiftPeriod, shopLeaderboards, shopStar } from "@/server/services/badges";
import { rateOrder } from "@/server/services/review";
import { deliverWithRider, fixture, makeRider, resetDb } from "./helpers";

type F = Awaited<ReturnType<typeof fixture>>;

async function packed(f: F) {
  await addToCart(f.customer.customerId, f.inv1.id, 1, false);
  const order = await placeOrder(f.customer, { addressId: f.customer.addressId, paymentMethod: "COD" });
  for (const to of ["SHOP_ACCEPTED", "PREPARING", "READY_FOR_PACKING", "PACKED"] as const) await transitionOrder(order.id, to, f.owner);
  return order;
}

describe("star badges", () => {
  beforeEach(resetDb);

  it("scores shops and riders per category, awards last month once, and exposes current holders", async () => {
    const f = await fixture();
    const rider = await makeRider();
    for (let i = 0; i < 4; i++) await deliverWithRider((await packed(f)).id, f.owner, rider);

    // Live leaderboard for this month: 4 delivered, no reviews → neutral 4★ (quality 0.8) → 4 × 0.8 = 3.2.
    const shops = await shopLeaderboards(currentPeriod());
    expect(shops).toHaveLength(1);
    expect(shops[0].entries[0]).toMatchObject({ shopId: f.shop.id, delivered: 4, rejected: 0, rating: null, score: 3.2, qualifies: true, rank: 1 });
    // Rider: 4 × (0.75 × 0.8 + 0.25 × 100% on time) = 3.4.
    const riders = await riderLeaderboards(currentPeriod());
    expect(riders[0].entries[0]).toMatchObject({ riderId: rider.riderId, delivered: 4, onTimePct: 100, rating: null, failed: 0, score: 3.4, qualifies: true });

    // Can't award a month that isn't over.
    await expect(awardMonth(currentPeriod())).rejects.toThrow(/finished months/);

    // Pretend those deliveries happened last month, then award it.
    const lastMonth = new Date(rangeOf(previousPeriod()).start.getTime() + 3 * 86400_000);
    await db.order.updateMany({ where: { status: "DELIVERED" }, data: { deliveredAt: lastMonth, placedAt: new Date(lastMonth.getTime() - 20 * 60_000) } });
    await db.shipment.updateMany({ where: { status: "DELIVERED" }, data: { deliveredAt: lastMonth } });
    expect(await awardMonth(previousPeriod())).toBe(2);
    expect(await awardMonth(previousPeriod())).toBe(0); // idempotent

    const holders = await currentHolders();
    expect(holders.shops.get(f.shop.id)).toMatchObject({ kind: "SHOP", period: previousPeriod() });
    expect(holders.riders.get(rider.riderId)).toMatchObject({ kind: "RIDER" });
    expect(await shopStar(f.shop.id)).not.toBeNull();
    expect(await riderStar(rider.riderId)).not.toBeNull();

    // A month earlier has no winners (nobody qualified).
    expect(await awardMonth(shiftPeriod(previousPeriod(), -1))).toBe(0);
  });

  it("needs at least 3 deliveries and penalises rejected orders", async () => {
    const f = await fixture();
    const rider = await makeRider();
    for (let i = 0; i < 2; i++) await deliverWithRider((await packed(f)).id, f.owner, rider);
    await addToCart(f.customer.customerId, f.inv1.id, 1, false);
    const o = await placeOrder(f.customer, { addressId: f.customer.addressId, paymentMethod: "COD" });
    await transitionOrder(o.id, "SHOP_REJECTED", f.owner, { remarks: "Out of stock" });

    const e = (await shopLeaderboards(currentPeriod()))[0].entries[0];
    expect(e).toMatchObject({ delivered: 2, rejected: 1, qualifies: false });
    expect(e.score).toBeCloseTo(2 * 0.8 - 2, 5);
    // Not qualified → nothing awarded for that month.
    const lastMonth = new Date(rangeOf(previousPeriod()).start.getTime() + 86400_000);
    await db.order.updateMany({ data: { deliveredAt: lastMonth, cancelledAt: lastMonth } });
    await db.order.updateMany({ where: { status: { not: "DELIVERED" } }, data: { deliveredAt: null } });
    await db.shipment.updateMany({ where: { status: "DELIVERED" }, data: { deliveredAt: lastMonth } });
    expect(await awardMonth(previousPeriod())).toBe(0);
  });

  it("customer ratings of the shop and rider decide the star", async () => {
    const f = await fixture({ stock: 100 });
    const good = await makeRider({ phone: "9000000101" });
    const busy = await makeRider({ phone: "9000000102" });
    const goodOrders: string[] = [];
    const busyOrders: string[] = [];
    for (let i = 0; i < 3; i++) goodOrders.push((await packed(f)).id);
    for (let i = 0; i < 4; i++) busyOrders.push((await packed(f)).id);
    for (const id of goodOrders) await deliverWithRider(id, f.owner, good);
    for (const id of busyOrders) await deliverWithRider(id, f.owner, busy);

    // The rider with fewer deliveries but 5★ ratings beats the busier 2★ rider.
    for (const id of goodOrders) await rateOrder(f.customer.customerId, id, { rating: 5, riderRating: 5, riderComment: "Very polite" });
    for (const id of busyOrders) await rateOrder(f.customer.customerId, id, { rating: 3, riderRating: 2 });
    const board = (await riderLeaderboards(currentPeriod()))[0].entries;
    expect(board[0]).toMatchObject({ riderId: good.riderId, rating: 5, score: 3 }); // 3 × (0.75 × 1 + 0.25 × 1)
    expect(board[1]).toMatchObject({ riderId: busy.riderId, rating: 2 });
    expect(board[1].score).toBeCloseTo(4 * (0.75 * 0.4 + 0.25), 5);

    // Averages are kept on the rider and shop.
    expect(await db.rider.findUnique({ where: { id: good.riderId }, select: { rating: true, ratingCount: true } })).toEqual({ rating: 5, ratingCount: 3 });
    expect(await db.rider.findUnique({ where: { id: busy.riderId }, select: { rating: true, ratingCount: true } })).toEqual({ rating: 2, ratingCount: 4 });
    expect(await db.shop.findUnique({ where: { id: f.shop.id }, select: { rating: true, ratingCount: true } })).toEqual({ rating: 3.9, ratingCount: 7 });
    expect((await shopLeaderboards(currentPeriod()))[0].entries[0].rating).toBe(3.9);

    // One rating per order.
    await expect(rateOrder(f.customer.customerId, goodOrders[0], { rating: 4 })).rejects.toThrow(/already rated/);
  });

  it("only rider deliveries can rate a rider, and only after delivery", async () => {
    const f = await fixture();
    const o = await packed(f);
    await expect(rateOrder(f.customer.customerId, o.id, { rating: 5 })).rejects.toThrow(/after it is delivered/);
    // Shop delivers with its own staff.
    await db.shop.update({ where: { id: f.shop.id }, data: { deliveryMode: "OWN" } });
    const own = await packed(f);
    for (const to of ["OUT_FOR_DELIVERY", "DELIVERED"] as const) await transitionOrder(own.id, to, f.owner);
    await expect(rateOrder(f.customer.customerId, own.id, { rating: 4, riderRating: 5 })).rejects.toThrow(/not delivered by a Dukaan rider/);
    const r = await rateOrder(f.customer.customerId, own.id, { rating: 4 });
    expect(r).toMatchObject({ rating: 4, riderId: null, riderRating: null });
  });
});
