import { Suspense } from "react";
import { getSessionUser } from "@/server/auth/session";
import { readLocationCookie, eligibleShops } from "@/server/services/location";
import { getCartView } from "@/server/services/cart";
import { CartProvider, type CartSummary } from "@/components/customer/cart-context";
import { BottomNav, CustomerHeader, MobileCartBar } from "@/components/customer/header";

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const [user, loc] = await Promise.all([getSessionUser(), readLocationCookie()]);
  const customer = user?.role === "CUSTOMER" ? user : null;
  const point = loc ? { lat: loc.lat, lng: loc.lng } : null;

  let summary: CartSummary = { shopId: null, shopName: null, lines: {}, count: 0, total: 0 };
  if (customer?.customerId) {
    const v = await getCartView(customer.customerId, point);
    summary = {
      shopId: v.shop?.id ?? null,
      shopName: v.shop?.name ?? null,
      lines: Object.fromEntries(v.items.map((i) => [i.inventoryId, i.quantity])),
      count: v.items.reduce((s, i) => s + i.quantity, 0),
      total: v.quote.total,
    };
  }
  const eta = point ? ((await eligibleShops(point)).find((s) => s.orderable)?.etaMinutes ?? null) : null;

  return (
    <CartProvider initial={summary} loggedIn={!!customer}>
      <Suspense>
        <CustomerHeader user={customer ? { name: customer.name } : null} location={loc} eta={eta} />
      </Suspense>
      <main className="mx-auto max-w-7xl px-4 pt-4 pb-36 sm:pb-16">{children}</main>
      <MobileCartBar />
      <BottomNav />
    </CartProvider>
  );
}
