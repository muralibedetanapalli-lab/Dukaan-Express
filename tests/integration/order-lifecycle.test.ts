import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { addToCart, getCartView } from "@/server/services/cart";
import { cancelByCustomer, placeOrder, transitionOrder, requestModification, reviewModification } from "@/server/services/order";
import { startPayment, verifyPayment } from "@/server/services/payment";
import { createShipmentForOrder, simulateNextCourierEvent, handleShiprocketWebhook } from "@/server/services/shipment";
import { AppError } from "@/server/errors";
import { fixture, resetDb } from "./helpers";

async function statusOf(id: string) {
  return (await db.order.findUniqueOrThrow({ where: { id } })).status;
}

describe("order lifecycle (integration)", () => {
  beforeEach(resetDb);

  it("COD order: place → accept → prepare → pack → Shiprocket (sandbox) → delivered, with commission", async () => {
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
    const ship = await createShipmentForOrder(order.id, f.owner);
    expect(ship.ok).toBe(true);
    expect(ship.shipment.awbCode).toMatch(/^MOCKAWB/);
    expect(await statusOf(order.id)).toBe("SHIPMENT_CREATED");

    for (const expected of ["COURIER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED"]) {
      await simulateNextCourierEvent(order.id);
      expect(await statusOf(order.id)).toBe(expected);
    }

    const done = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { commission: true, payments: true, statusHistory: true } });
    expect(done.paymentStatus).toBe("CAPTURED");
    expect(done.commission?.amount).toBe(5400); // 10% of ₹540
    expect(done.commission?.shopEarning).toBe(48600);
    expect(done.statusHistory.map((h) => h.toStatus)).toEqual([
      "CREATED", "SHOP_PENDING", "SHOP_ACCEPTED", "PREPARING", "READY_FOR_PACKING", "PACKED",
      "SHIPMENT_CREATING", "SHIPMENT_CREATED", "COURIER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED",
    ]);
  });

  it("online payment → shop rejects → stock restored and full refund processed", async () => {
    const f = await fixture();
    await addToCart(f.customer.customerId, f.inv1.id, 1, false);
    const order = await placeOrder(f.customer, { addressId: f.customer.addressId, paymentMethod: "UPI" });
    expect(order.status).toBe("PAYMENT_PENDING");

    const checkout = await startPayment(order.id, f.customer.customerId);
    expect(checkout.mode).toBe("sandbox");
    await verifyPayment(f.customer.customerId, { orderId: order.id, razorpayOrderId: checkout.razorpayOrderId, sandboxOutcome: "success" });
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

describe("Shiprocket integration safeguards (sandbox adapter)", () => {
  beforeEach(resetDb);

  async function packedOrder(pincode: string) {
    const f = await fixture({ deliveryPincode: pincode });
    await addToCart(f.customer.customerId, f.inv1.id, 1, false);
    const order = await placeOrder(f.customer, { addressId: f.customer.addressId, paymentMethod: "COD" });
    for (const to of ["SHOP_ACCEPTED", "PREPARING", "READY_FOR_PACKING", "PACKED"] as const) await transitionOrder(order.id, to, f.owner);
    return { f, order };
  }

  it("raises a shipment exception when no courier is serviceable and allows retry", async () => {
    const { f, order } = await packedOrder("560999");
    const r = await createShipmentForOrder(order.id, f.owner);
    expect(r.ok).toBe(false);
    expect(r.shipment.status).toBe("EXCEPTION");
    expect(await statusOf(order.id)).toBe("PACKED");
    // a second attempt is allowed (still no courier) and counts attempts
    const r2 = await createShipmentForOrder(order.id, f.owner);
    expect(r2.shipment.attempts).toBe(2);
  });

  it("does not create duplicate shipments when the create call times out", async () => {
    const { f, order } = await packedOrder("560998");
    const r = await createShipmentForOrder(order.id, f.owner);
    // the simulated timeout is reconciled by looking the channel order up
    expect(r.ok).toBe(true);
    const shipments = await db.shipment.findMany({ where: { orderId: order.id } });
    expect(shipments).toHaveLength(1);
    expect(shipments[0].shiprocketShipmentId).toMatch(/^MOCK-SHP-/);
    await expect(createShipmentForOrder(order.id, f.owner)).rejects.toMatchObject({ status: 409 });
  });

  it("de-duplicates repeated webhook deliveries", async () => {
    const { f, order } = await packedOrder("560034");
    const r = await createShipmentForOrder(order.id, f.owner);
    const payload = JSON.stringify({ awb: r.shipment.awbCode, current_status: "PICKED UP", current_status_id: 42, current_timestamp: "10 11 2026 10:00:00" });
    await handleShiprocketWebhook(payload, null, true);
    const second = await handleShiprocketWebhook(payload, null, true);
    expect(second).toMatchObject({ duplicate: true });
    expect(await statusOf(order.id)).toBe("PICKED_UP");
    expect(await db.webhookEvent.count({ where: { provider: "SHIPROCKET" } })).toBe(1);
  });
});
