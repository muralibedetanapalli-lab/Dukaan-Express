import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { addToCart } from "@/server/services/cart";
import { placeOrder, transitionOrder } from "@/server/services/order";
import { awardMonth, currentHolders, currentPeriod, previousPeriod, rangeOf, riderLeaderboards, riderStar, shiftPeriod, shopLeaderboards, shopStar } from "@/server/services/badges";
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

    // Live leaderboard for this month: 4 delivered, no reviews → neutral 4★ → 4 × 0.9 = 3.6.
    const shops = await shopLeaderboards(currentPeriod());
    expect(shops).toHaveLength(1);
    expect(shops[0].entries[0]).toMatchObject({ shopId: f.shop.id, delivered: 4, rejected: 0, score: 3.6, qualifies: true, rank: 1 });
    const riders = await riderLeaderboards(currentPeriod());
    expect(riders[0].entries[0]).toMatchObject({ riderId: rider.riderId, delivered: 4, onTimePct: 100, failed: 0, score: 4, qualifies: true });

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
    expect(e.score).toBeCloseTo(2 * 0.9 - 2, 5);
    // Not qualified → nothing awarded for that month.
    const lastMonth = new Date(rangeOf(previousPeriod()).start.getTime() + 86400_000);
    await db.order.updateMany({ data: { deliveredAt: lastMonth, cancelledAt: lastMonth } });
    await db.order.updateMany({ where: { status: { not: "DELIVERED" } }, data: { deliveredAt: null } });
    await db.shipment.updateMany({ where: { status: "DELIVERED" }, data: { deliveredAt: lastMonth } });
    expect(await awardMonth(previousPeriod())).toBe(0);
  });
});
