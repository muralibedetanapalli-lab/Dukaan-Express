import Link from "next/link";
import { AlertTriangle, Clock, ShoppingCart, Store } from "lucide-react";
import { getSessionUser } from "@/server/auth/session";
import { getCartView } from "@/server/services/cart";
import { readLocationCookie } from "@/server/services/location";
import { availableCoupons } from "@/server/services/coupon";
import { AddButton } from "@/components/customer/add-button";
import { EmptyState, ProductThumb } from "@/components/shared/misc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatINR } from "@/lib/money";
import { BillSummary } from "@/components/customer/bill-summary";
import { CouponBox, ClearCartButton } from "./cart-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cart" };

export default async function CartPage() {
  const user = await getSessionUser();
  if (!user?.customerId) {
    return (
      <EmptyState
        icon={ShoppingCart}
        title="Log in to view your cart"
        action={
          <Button asChild>
            <Link href="/login?next=/cart">Log in</Link>
          </Button>
        }
      />
    );
  }
  const loc = await readLocationCookie();
  const cart = await getCartView(user.customerId, loc ? { lat: loc.lat, lng: loc.lng } : null);
  if (!cart.items.length) {
    return (
      <EmptyState
        icon={ShoppingCart}
        title="Your cart is empty"
        description="Browse products from shops near you and add them here."
        action={
          <Button asChild>
            <Link href="/">Start shopping</Link>
          </Button>
        }
      />
    );
  }
  const coupons = await availableCoupons(cart.shop?.id ?? null);

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">My cart</h1>
          <ClearCartButton />
        </div>
        {cart.shop && (
          <Card className="flex-row items-center gap-3 p-4">
            <Store className="size-5 text-primary" />
            <div className="min-w-0 flex-1">
              <Link href={`/stores/${cart.shop.slug}`} className="font-semibold hover:underline">
                {cart.shop.name}
              </Link>
              {cart.shop.etaMinutes != null && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="size-3" /> Delivery in about {cart.shop.etaMinutes} minutes
                </p>
              )}
            </div>
          </Card>
        )}
        {cart.blockers.length > 0 && (
          <div className="space-y-1 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {cart.blockers.map((b) => (
              <p key={b} className="flex items-center gap-2">
                <AlertTriangle className="size-4 shrink-0" /> {b}
              </p>
            ))}
          </div>
        )}
        <Card className="divide-y gap-0 p-0">
          {cart.items.map((i) => (
            <div key={i.id} className="flex items-center gap-3 p-3">
              <ProductThumb src={i.imageUrl} alt={i.name} className="size-16 shrink-0" />
              <div className="min-w-0 flex-1">
                <Link href={`/product/${i.productSlug}`} className="line-clamp-2 text-sm font-semibold">
                  {i.name}
                </Link>
                <p className="text-xs text-muted-foreground">{i.unitLabel}</p>
                {i.issue && <p className="text-xs font-semibold text-destructive">{i.issue}</p>}
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <AddButton inventoryId={i.inventoryId} maxQty={i.maxQty} disabled={i.issue === "No longer available"} />
                <div className="text-right text-sm leading-tight">
                  <span className="font-bold">{formatINR(i.lineTotal)}</span>
                  {i.mrp > i.price && <span className="ml-1 text-xs text-muted-foreground line-through">{formatINR(i.mrp * i.quantity)}</span>}
                </div>
              </div>
            </div>
          ))}
        </Card>
      </div>
      <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <CouponBox
          applied={cart.couponCode}
          error={cart.quote.couponError}
          coupons={coupons.map((c) => ({ code: c.code, description: c.description }))}
        />
        <BillSummary quote={cart.quote} />
        <Button asChild size="lg" className="h-12 w-full text-base" disabled={!cart.canCheckout}>
          {cart.canCheckout ? <Link href="/checkout">Proceed to checkout · {formatINR(cart.quote.total)}</Link> : <span className="pointer-events-none opacity-50">Proceed to checkout</span>}
        </Button>
      </div>
    </div>
  );
}
