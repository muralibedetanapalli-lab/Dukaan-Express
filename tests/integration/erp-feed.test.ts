import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import type { SessionUser } from "@/server/auth/session";
import { addToCart } from "@/server/services/cart";
import { placeOrder, transitionOrder } from "@/server/services/order";
import { markSettlementPaid, requestPayout, saveBankAccount, zBankInput } from "@/server/services/payout";
import { eventsFeed, partiesFeed } from "@/server/services/erp-feed";
import { GET } from "@/app/api/v1/integrations/erp/[feed]/route";
import { deliverWithRider, fixture, resetDb } from "./helpers";

type F = Awaited<ReturnType<typeof fixture>>;
const asUser = (a: { id: string; role: string }) => a as unknown as SessionUser;

async function deliveredOrder(f: F, paymentMethod: "COD" | "UPI" = "COD") {
  await addToCart(f.customer.customerId, f.inv1.id, 2, false);
  const order = await placeOrder(f.customer, { addressId: f.customer.addressId, paymentMethod });
  for (const to of ["SHOP_ACCEPTED", "PREPARING", "READY_FOR_PACKING", "PACKED"] as const) await transitionOrder(order.id, to, f.owner);
  await deliverWithRider(order.id, f.owner);
  return order;
}

const call = (feed: string, headers: Record<string, string> = {}, qs = "") =>
  GET(new NextRequest(`http://localhost/api/v1/integrations/erp/${feed}${qs}`, { headers }), { params: Promise.resolve({ feed }) });

describe("Metech ERP feeds (integration)", () => {
  beforeEach(resetDb);
  afterEach(() => {
    delete process.env.ERP_API_KEY;
  });

  it("lists every party once across pages and resumes from the cursor", async () => {
    const f = await fixture();
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 20; i++) {
      const page = await partiesFeed(cursor, 1);
      seen.push(...page.items.map((p) => `${p.type}:${p.id}`));
      cursor = page.nextCursor;
      if (!page.hasMore) break;
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toContain(`SHOP:${f.shop.id}`);
    expect(seen).toContain(`SHOP_OWNER:${f.owner.shopOwnerId}`);
    expect(seen).toContain(`CUSTOMER:${f.customer.customerId}`);
    // Nothing changed since: the saved cursor returns no items.
    expect((await partiesFeed(cursor, 50)).items).toHaveLength(0);
  });

  it("emits a delivered-order event with the commission split and a settlement event once paid", async () => {
    const f = await fixture();
    const order = await deliveredOrder(f);
    const first = await eventsFeed(undefined, 50);
    const ev = first.items.find((e) => e.id === `order.delivered:${order.id}`) as { data: Record<string, unknown> } | undefined;
    expect(ev).toBeDefined();
    expect(ev!.data).toMatchObject({ orderId: order.id, shopId: f.shop.id, paymentMethod: "COD", commissionAmount: 5400, shopEarning: 48600 });

    await saveBankAccount(asUser(f.owner), f.shop.id, zBankInput.parse({ accountHolderName: "Ravi Kumar", accountNumber: "50100123456789", ifsc: "HDFC0001234", bankName: "HDFC", upiId: "" }));
    const p = await requestPayout(asUser(f.owner), f.shop.id);
    await markSettlementPaid(asUser(f.admin), p.id, { reference: "UTR123456", payoutMethod: "IMPS" });
    const next = await eventsFeed(first.nextCursor, 50);
    expect(next.items.map((e) => e.id)).toEqual([`shop_settlement.paid:${p.id}`]);
    expect(next.items[0]).toMatchObject({ type: "shop_settlement.paid", data: { shopId: f.shop.id, amount: 48600, reference: "UTR123456" } });
  });

  it("requires the service key and is off when no key is configured", async () => {
    expect((await call("parties", { authorization: "Bearer anything" })).status).toBe(503);
    process.env.ERP_API_KEY = "test-erp-key-0123456789-abcdefghij";
    expect((await call("parties")).status).toBe(401);
    expect((await call("parties", { authorization: "Bearer wrong" })).status).toBe(401);
    const ok = await call("events", { authorization: "Bearer test-erp-key-0123456789-abcdefghij" }, "?limit=5");
    expect(ok.status).toBe(200);
    expect((await ok.json()).data).toMatchObject({ items: [], hasMore: false });
    expect((await call("nope", { authorization: "Bearer test-erp-key-0123456789-abcdefghij" })).status).toBe(404);
  });
});
