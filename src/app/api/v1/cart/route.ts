import { z } from "zod";
import { api } from "@/server/http";
import { db } from "@/server/db";
import { addToCart, applyCoupon, clearCart, getCartView, setCartQuantity } from "@/server/services/cart";
import { readLocationCookie } from "@/server/services/location";

async function view(customerId: string) {
  const loc = await readLocationCookie();
  let point = loc ? { lat: loc.lat, lng: loc.lng } : null;
  if (!point) {
    const addr = await db.customerAddress.findFirst({ where: { customerId, deletedAt: null }, orderBy: { isDefault: "desc" } });
    if (addr) point = { lat: addr.latitude, lng: addr.longitude };
  }
  return getCartView(customerId, point);
}

export const GET = api({ roles: ["CUSTOMER"] }, async ({ user }) => view(user.customerId!));

/** Add an item. `replaceCart` clears items from another shop (single-shop cart rule). */
export const POST = api(
  {
    roles: ["CUSTOMER"],
    body: z.object({ inventoryId: z.string().min(1), quantity: z.number().int().min(1).max(100).default(1), replaceCart: z.boolean().default(false) }),
    rateLimit: { name: "cart", limit: 120 },
  },
  async ({ user, body }) => {
    await addToCart(user.customerId!, body.inventoryId, body.quantity, body.replaceCart);
    return view(user.customerId!);
  },
);

/** Set an exact quantity (0 removes) or apply/remove a coupon. */
export const PATCH = api(
  {
    roles: ["CUSTOMER"],
    body: z.union([
      z.object({ inventoryId: z.string().min(1), quantity: z.number().int().min(0).max(100) }),
      z.object({ couponCode: z.string().trim().max(30).nullable() }),
    ]),
    rateLimit: { name: "cart", limit: 120 },
  },
  async ({ user, body }) => {
    if ("couponCode" in body) await applyCoupon(user.customerId!, body.couponCode);
    else await setCartQuantity(user.customerId!, body.inventoryId, body.quantity);
    return view(user.customerId!);
  },
);

export const DELETE = api({ roles: ["CUSTOMER"] }, async ({ user }) => {
  await clearCart(user.customerId!);
  return view(user.customerId!);
});
