import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { addToCart, getCartView } from "@/server/services/cart";
import { cancelByCustomer, placeOrder, transitionOrder, requestModification, reviewModification } from "@/server/services/order";
import { startPayment, verifyPayment } from "@/server/services/payment";
import { acceptJob, completeDelivery, dispatchOwn, failDelivery, pickUp, releaseJob, startDelivery } from "@/server/services/delivery";
import { cancelWithdrawal, markWithdrawalPaid, rejectWithdrawal, requestWithdrawal, reviewWithdrawal, saveRiderBank, walletBalance } from "@/server/services/rider";
import { createDealer } from "@/server/services/dealer";
import { zBankInput } from "@/server/services/payout";
import type { SessionUser } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { fixture, makeRider, resetDb } from "./helpers";

const asUser = (a: object) => a as unknown as SessionUser;
const codeOf = async (orderId: string) => (await db.shipment.findUniqueOrThrow({ where: { orderId } })).deliveryCode;

async function statusOf(id: string) {
  return (await db.order.findUniqueOrThrow({ where: { id } })).status;
}

describe("order lifecycle (integration)", () => {
  beforeEach(resetDb);

  it("COD order: place → accept → prepare → pack → rider accepts, picks up, delivers with code → commission + rider wallet", async () => {
    const f = await fixture();
    await addToCart(f.customer.customerId, f.inv1.id, 2, false);
    const order = await placeOrder(f.customer, { addressId: f.customer.addressId, paymentMethod: "COD" });

    expect(order.status).toBe("SHOP_PENDING");
    expect(order.subtotal).toBe(54000);
    expect(order.total).toBe(54000); // free delivery above ₹499, prices tax-inclusive
    expect((await db.shopInventory.findUniqueOrThrow({ where: { id: f.inv1.id } })).stock).toBe(18);
    expect(await db.cartItem.count()).toBe(0);

    for (const to of ["SHOP_ACCEPTED", "PREPARING", "READY_FOR_PACKING", "PACKED"] as const) {
      await transitionOrder(order.id, to, f.owner);
    }
    const ship = await startDelivery(order.id, f.owner);
    expect(ship).toMatchObject({ mode: "RIDER", status: "CREATED", riderFee: 2500, codAmount: 54000 });
    expect(ship.deliveryCode).toMatch(/^\d{4}$/);
    expect(await statusOf(order.id)).toBe("SHIPMENT_CREATED");

    const rider = await makeRider();
    await acceptJob(asUser(rider), ship.id);
    expect(await statusOf(order.id)).toBe("COURIER_ASSIGNED");
    await expect(completeDelivery(asUser(rider), order.id, ship.deliveryCode)).rejects.toMatchObject({ status: 409 }); // not picked up yet
    await pickUp(asUser(rider), ship.id);
    expect(await statusOf(order.id)).toBe("OUT_FOR_DELIVERY");
    const wrong = ship.deliveryCode === "0000" ? "1111" : "0000";
    await expect(completeDelivery(asUser(rider), order.id, wrong)).rejects.toMatchObject({ status: 400 });
    await completeDelivery(asUser(rider), order.id, ship.deliveryCode);
    expect(await statusOf(order.id)).toBe("DELIVERED");

    // Rider earns the delivery fee (even though the customer got free delivery) and owes the COD cash.
    const entries = await db.riderWalletEntry.findMany({ where: { riderId: rider.riderId }, orderBy: { amount: "desc" } });
    expect(entries.map((e) => [e.type, e.amount])).toEqual([
      ["DELIVERY_EARNING", 2500],
      ["COD_COLLECTED", -54000],
    ]);
    expect(await walletBalance(rider.riderId)).toBe(-51500);

    const done = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { commission: true, payments: true, statusHistory: true } });
    expect(done.paymentStatus).toBe("CAPTURED");
    expect(done.commission?.amount).toBe(5400); // 10% of ₹540
    expect(done.commission?.shopEarning).toBe(48600);
    expect(done.statusHistory.map((h) => h.toStatus)).toEqual([
      "CREATED", "SHOP_PENDING", "SHOP_ACCEPTED", "PREPARING", "READY_FOR_PACKING", "PACKED",
      "SHIPMENT_CREATED", "COURIER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED",
    ]);
  });

  it("online payment → shop rejects → stock restored and full refund processed", async () => {
    const f = await fixture();
    await addToCart(f.customer.customerId, f.inv1.id, 1, false);
    const order = await placeOrder(f.customer, { addressId: f.customer.addressId, paymentMethod: "UPI" });
    expect(order.status).toBe("PAYMENT_PENDING");

    const checkout = await startPayment(order.id, f.customer.customerId);
    expect(checkout.mode).toBe("sandbox");
    await verifyPayment(f.customer.customerId, { orderId: order.id, gatewayOrderId: checkout.gatewayOrderId, sandboxOutcome: "success" });
    expect(await statusOf(order.id)).toBe("SHOP_PENDING");

    await transitionOrder(order.id, "SHOP_REJECTED", f.owner, { remarks: "Out of stock" });
    // allow post-commit refund side effects to finish
    const final = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { refunds: true } });
    expect(final.status).toBe("REFUNDED");
    expect(final.paymentStatus).toBe("REFUNDED");
    expect(final.refunds[0].amount).toBe(final.total);
    expect((await db.shopInventory.findUniqueOrThrow({ where: { id: f.inv1.id } })).stock).toBe(20);
  });

  it("never trusts the client: totals are recomputed from live inventory", async () => {
    const f = await fixture();
    await addToCart(f.customer.customerId, f.inv1.id, 1, false);
    await db.shopInventory.update({ where: { id: f.inv1.id }, data: { sellingPrice: 25000 } }); // shop changes price
    const order = await placeOrder(f.customer, { addressId: f.customer.addressId, paymentMethod: "COD" });
    expect(order.subtotal).toBe(25000);
  });

  it("prevents overselling under concurrent checkouts", async () => {
    const f = await fixture();
    // second customer
    const u2 = await db.user.create({
      data: {
        role: "CUSTOMER",
        phone: "9876511111",
        customer: { create: { cart: { create: {} }, addresses: { create: { name: "B", phone: "9876511111", line1: "x street", city: "B", state: "K", pincode: "560034", latitude: 12.934, longitude: 77.623 } } } },
      },
      include: { customer: { include: { addresses: true } } },
    });
    const c2 = { userId: u2.id, customerId: u2.customer!.id, addressId: u2.customer!.addresses[0].id };
    await db.shopInventory.update({ where: { id: f.inv2.id }, data: { sellingPrice: 34000 } });
    await addToCart(f.customer.customerId, f.inv2.id, 1, false); // inv2 has stock 1
    await addToCart(c2.customerId, f.inv2.id, 1, false);
    const results = await Promise.allSettled([
      placeOrder(f.customer, { addressId: f.customer.addressId, paymentMethod: "COD" }),
      placeOrder(c2, { addressId: c2.addressId, paymentMethod: "COD" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((rejected.reason as AppError).code).toBe("OUT_OF_STOCK");
    expect((await db.shopInventory.findUniqueOrThrow({ where: { id: f.inv2.id } })).stock).toBe(0);
  });

  it("rejects invalid or unauthorised transitions and concurrent double-accepts", async () => {
    const f = await fixture();
    await addToCart(f.customer.customerId, f.inv1.id, 1, false);
    const order = await placeOrder(f.customer, { addressId: f.customer.addressId, paymentMethod: "COD" });

    await expect(transitionOrder(order.id, "SHOP_ACCEPTED", f.customerActor)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(transitionOrder(order.id, "PACKED", f.owner)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });

    const both = await Promise.allSettled([transitionOrder(order.id, "SHOP_ACCEPTED", f.owner), transitionOrder(order.id, "SHOP_ACCEPTED", f.owner)]);
    expect(both.filter((r) => r.status === "fulfilled")).toHaveLength(1);

    // another shop owner cannot see or act on the order
    const other = await db.user.create({ data: { role: "SHOP_OWNER", email: "x@y.in", shopOwner: { create: {} } }, include: { shopOwner: true } });
    await expect(transitionOrder(order.id, "PREPARING", { id: other.id, role: "SHOP_OWNER", shopOwnerId: other.shopOwner!.id })).rejects.toMatchObject({ status: 404 });
  });

  it("enforces the single-shop cart rule", async () => {
    const f = await fixture();
    const shop2 = await db.shop.create({
      data: {
        name: "Other",
        slug: "other",
        contactPhone: "9845000003",
        approvalStatus: "APPROVED",
        isActive: true,
        address: { create: { line1: "x", city: "B", state: "K", pincode: "560034", latitude: 12.935, longitude: 77.624 } },
      },
    });
    const inv = await db.shopInventory.create({ data: { shopId: shop2.id, productId: f.inv1.productId, mrp: 30000, sellingPrice: 26000, stock: 5 } });
    await addToCart(f.customer.customerId, f.inv1.id, 1, false);
    await expect(addToCart(f.customer.customerId, inv.id, 1, false)).rejects.toMatchObject({ status: 409, details: { reason: "CART_SHOP_CONFLICT" } });
    await addToCart(f.customer.customerId, inv.id, 1, true);
    const cart = await getCartView(f.customer.customerId, { lat: 12.9339, lng: 77.6229 });
    expect(cart.items).toHaveLength(1);
    expect(cart.shop?.id).toBe(shop2.id);
  });

  it("customer cancellation releases stock; not allowed once preparing", async () => {
    const f = await fixture();
    await addToCart(f.customer.customerId, f.inv1.id, 3, false);
    const o1 = await placeOrder(f.customer, { addressId: f.customer.addressId, paymentMethod: "COD" });
    await cancelByCustomer(o1.id, f.customerActor, "Changed my mind");
    expect(await statusOf(o1.id)).toBe("CANCELLED");
    expect((await db.shopInventory.findUniqueOrThrow({ where: { id: f.inv1.id } })).stock).toBe(20);

    await addToCart(f.customer.customerId, f.inv1.id, 1, false);
    const o2 = await placeOrder(f.customer, { addressId: f.customer.addressId, paymentMethod: "COD" });
    await transitionOrder(o2.id, "SHOP_ACCEPTED", f.owner);
    await transitionOrder(o2.id, "PREPARING", f.owner);
    await expect(cancelByCustomer(o2.id, f.customerActor, "late")).rejects.toMatchObject({ code: "NOT_CANCELLABLE" });
  });

  it("modification workflow: shop requests, admin approves, totals and stock adjust", async () => {
    const f = await fixture();
    await addToCart(f.customer.customerId, f.inv1.id, 3, false);
    const order = await placeOrder(f.customer, { addressId: f.customer.addressId, paymentMethod: "COD" });
    await transitionOrder(order.id, "SHOP_ACCEPTED", f.owner);
    const item = (await db.orderItem.findFirstOrThrow({ where: { orderId: order.id } })).id;
    await expect(requestModification(order.id, f.owner, { reason: "increase", changes: [{ orderItemId: item, newQuantity: 4 }] })).rejects.toBeInstanceOf(AppError);
    const mod = await requestModification(order.id, f.owner, { reason: "Only 2 left on shelf", changes: [{ orderItemId: item, newQuantity: 2 }] });
    await reviewModification(mod.id, f.admin, true, "ok");
    const o = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
    expect(o.items[0].quantity).toBe(2);
    expect(o.subtotal).toBe(54000);
    expect((await db.shopInventory.findUniqueOrThrow({ where: { id: f.inv1.id } })).stock).toBe(18);
  });
});

describe("deliveries: riders and own staff", () => {
  beforeEach(resetDb);

  async function packedOrder(paymentMethod: "COD" | "UPI" = "COD", existing?: Awaited<ReturnType<typeof fixture>>) {
    const f = existing ?? (await fixture());
    await addToCart(f.customer.customerId, f.inv1.id, 1, false);
    const order = await placeOrder(f.customer, { addressId: f.customer.addressId, paymentMethod: "COD" });
    if (paymentMethod === "UPI") await db.order.update({ where: { id: order.id }, data: { paymentMethod: "UPI", paymentStatus: "CAPTURED" } });
    for (const to of ["SHOP_ACCEPTED", "PREPARING", "READY_FOR_PACKING", "PACKED"] as const) await transitionOrder(order.id, to, f.owner);
    return { f, order };
  }

  it("only one rider can take a job; a rider can give it back before pickup", async () => {
    const { f, order } = await packedOrder();
    const ship = await startDelivery(order.id, f.owner);
    const [a, b] = await Promise.all([makeRider(), makeRider()]);
    const results = await Promise.allSettled([acceptJob(asUser(a), ship.id), acceptJob(asUser(b), ship.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const winner = results[0].status === "fulfilled" ? a : b;
    const loser = winner === a ? b : a;

    // The other rider can't act on it; the winner gives it back and the loser picks it up instead.
    await expect(pickUp(asUser(loser), ship.id)).rejects.toMatchObject({ status: 404 });
    await releaseJob(asUser(winner), ship.id, "Bike puncture");
    expect(await statusOf(order.id)).toBe("SHIPMENT_CREATED");
    await acceptJob(asUser(loser), ship.id);
    expect((await db.shipment.findUniqueOrThrow({ where: { id: ship.id } })).attempts).toBe(2);

    // A rider can only carry one delivery at a time.
    const second = await packedOrder("COD", f);
    const s2 = await startDelivery(second.order.id, f.owner);
    await expect(acceptJob(asUser(loser), s2.id)).rejects.toMatchObject({ status: 409 });
  });

  it("own delivery: shop dispatches and completes with the code, keeps the fee, COD cash is netted", async () => {
    const { f, order } = await packedOrder();
    await db.shop.update({ where: { id: f.shop.id }, data: { deliveryMode: "OWN" } });
    const ship = await startDelivery(order.id, f.owner);
    expect(ship).toMatchObject({ mode: "OWN", status: "PENDING", riderFee: 0 });
    expect(await statusOf(order.id)).toBe("PACKED");

    const owner = asUser({ ...f.owner, name: "Owner" });
    await dispatchOwn(owner, order.id);
    expect(await statusOf(order.id)).toBe("OUT_FOR_DELIVERY");
    await failDelivery(owner, order.id, "Customer not reachable");
    expect(await statusOf(order.id)).toBe("DELIVERY_FAILED");
    await dispatchOwn(owner, order.id); // try again
    await completeDelivery(owner, order.id, await codeOf(order.id));

    const o = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { commission: true } });
    expect(o.status).toBe("DELIVERED");
    // items ₹270, commission 10% = ₹27, delivery fee ₹25 kept, the ₹295 cash is already with the shop → shop owes ₹27.
    expect(o.deliveryFee).toBe(2500);
    expect(o.total).toBe(29500);
    expect(o.commission).toMatchObject({ amount: 2700, shopEarning: -2700 });
    expect(await db.riderWalletEntry.count()).toBe(0);
  });

  it("rider shop with no rider: the shop can switch the order to its own staff", async () => {
    const { f, order } = await packedOrder();
    await startDelivery(order.id, f.owner);
    await dispatchOwn(asUser({ ...f.owner, name: "Owner" }), order.id);
    expect(await db.shipment.findUniqueOrThrow({ where: { orderId: order.id } })).toMatchObject({ mode: "OWN", status: "OUT_FOR_DELIVERY", riderFee: 0 });
    // A rider can no longer take it.
    const r = await makeRider();
    const s = await db.shipment.findUniqueOrThrow({ where: { orderId: order.id } });
    await expect(acceptJob(asUser(r), s.id)).rejects.toMatchObject({ status: 409 });
  });

  it("rider withdrawal: dealer approves, admin pays; declines return the money", async () => {
    const f = await fixture();
    const { id: dealerId } = await createDealer(asUser(f.admin), { name: "Dev", email: "d@d.in", phone: "9811100009", password: "Dealer@123", commissionShareBps: 2000, regionIds: [] });
    const dealer = await db.dealer.findUniqueOrThrow({ where: { id: dealerId } });
    const dealerUser = asUser({ id: dealer.userId, role: "DEALER", name: "Dev", dealerId });
    const rider = await makeRider({ dealerId });

    // Earn two prepaid deliveries (no cash collected).
    for (let i = 0; i < 2; i++) {
      await addToCart(f.customer.customerId, f.inv1.id, 1, false);
      const order = await placeOrder(f.customer, { addressId: f.customer.addressId, paymentMethod: "COD" });
      await db.order.update({ where: { id: order.id }, data: { paymentMethod: "UPI", paymentStatus: "CAPTURED" } });
      for (const to of ["SHOP_ACCEPTED", "PREPARING", "READY_FOR_PACKING", "PACKED"] as const) await transitionOrder(order.id, to, f.owner);
      const s = await startDelivery(order.id, f.owner);
      await acceptJob(asUser(rider), s.id);
      await pickUp(asUser(rider), s.id);
      await completeDelivery(asUser(rider), order.id, await codeOf(order.id));
    }
    expect(await walletBalance(rider.riderId)).toBe(5000);

    await expect(requestWithdrawal(asUser(rider))).rejects.toThrow(/bank account/i);
    await saveRiderBank(asUser(rider), zBankInput.parse({ accountHolderName: "Test Rider", accountNumber: "123456789012", ifsc: "SBIN0001234", bankName: "SBI", upiId: "" }));
    await expect(requestWithdrawal(asUser(rider), 9000)).rejects.toMatchObject({ status: 400 });

    const w = await requestWithdrawal(asUser(rider));
    expect(w).toMatchObject({ amount: 5000, status: "DEALER_REVIEW", dealerId });
    expect(await walletBalance(rider.riderId)).toBe(0); // set aside
    await expect(markWithdrawalPaid(asUser(f.admin), w.id, { reference: "UTR1", payoutMethod: "IMPS" })).rejects.toMatchObject({ status: 409 });

    // Dealer declines → money back; rider re-requests and cancels → money back; then approve + pay.
    await reviewWithdrawal(dealerUser, w.id, { approve: false, reason: "Bank name mismatch" });
    expect(await walletBalance(rider.riderId)).toBe(5000);
    const w2 = await requestWithdrawal(asUser(rider));
    await cancelWithdrawal(asUser(rider), w2.id);
    expect(await walletBalance(rider.riderId)).toBe(5000);
    const w3 = await requestWithdrawal(asUser(rider), 3000);
    await reviewWithdrawal(dealerUser, w3.id, { approve: true });
    expect((await db.riderWithdrawal.findUniqueOrThrow({ where: { id: w3.id } })).status).toBe("PENDING");
    await markWithdrawalPaid(asUser(f.admin), w3.id, { reference: "UTR777", payoutMethod: "UPI" });
    expect(await db.riderWithdrawal.findUniqueOrThrow({ where: { id: w3.id } })).toMatchObject({ status: "PAID", reference: "UTR777" });
    expect(await walletBalance(rider.riderId)).toBe(2000);
    await expect(rejectWithdrawal(asUser(f.admin), w3.id, "late")).rejects.toMatchObject({ status: 409 });
  });

  it("a rider who collected more cash than they earned cannot withdraw", async () => {
    const { f, order } = await packedOrder("COD");
    const rider = await makeRider();
    const s = await startDelivery(order.id, f.owner);
    await acceptJob(asUser(rider), s.id);
    await pickUp(asUser(rider), s.id);
    await completeDelivery(asUser(rider), order.id, await codeOf(order.id));
    expect(await walletBalance(rider.riderId)).toBeLessThan(0);
    await saveRiderBank(asUser(rider), zBankInput.parse({ accountHolderName: "Test Rider", accountNumber: "123456789012", ifsc: "SBIN0001234", bankName: "", upiId: "" }));
    await expect(requestWithdrawal(asUser(rider))).rejects.toThrow(/owe/);
  });
});
