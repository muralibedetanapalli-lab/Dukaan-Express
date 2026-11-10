import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getCartView } from "@/server/services/cart";
import { readLocationCookie } from "@/server/services/location";
import { getSettings } from "@/server/services/settings";
import { integrationModes } from "@/server/env";
import { CheckoutClient } from "./checkout-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Checkout" };

export default async function CheckoutPage() {
  const user = await getSessionUser();
  if (!user?.customerId) redirect("/login?next=/checkout");
  const [addresses, loc, settings] = await Promise.all([
    db.customerAddress.findMany({ where: { customerId: user.customerId, deletedAt: null }, orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }] }),
    readLocationCookie(),
    getSettings(),
  ]);
  const selected = addresses.find((a) => a.id === loc?.addressId) ?? addresses[0] ?? null;
  const point = selected ? { lat: selected.latitude, lng: selected.longitude } : loc ? { lat: loc.lat, lng: loc.lng } : null;
  const cart = await getCartView(user.customerId, point);
  if (!cart.items.length) redirect("/cart");

  return (
    <CheckoutClient
      cart={cart}
      addresses={addresses}
      selectedAddressId={selected?.id ?? null}
      profile={{ name: user.name ?? "", phone: user.phone ?? "" }}
      payments={settings.payments}
      sandbox={integrationModes().razorpay === "mock"}
    />
  );
}
