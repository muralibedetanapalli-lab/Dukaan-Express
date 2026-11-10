"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Home, LayoutGrid, Package, Search, ShoppingBag, User, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/shared/notification-bell";
import { LocationPicker } from "./location-picker";
import { useCart } from "./cart-context";

interface Props {
  user: { name: string | null } | null;
  location: { lat: number; lng: number; label: string } | null;
  eta: number | null;
}

export function CustomerHeader({ user, location, eta }: Props) {
  const { cart } = useCart();
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
        <Link href="/" className="hidden shrink-0 items-center gap-1.5 text-lg font-extrabold text-primary sm:flex">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Zap className="size-4" />
          </span>
          <span className="hidden lg:inline">Dukaan Express</span>
        </Link>
        <div className="min-w-0 flex-1 sm:max-w-56 sm:flex-none">
          <LocationPicker current={location} loggedIn={!!user} eta={eta} />
        </div>
        <form
          className="relative hidden flex-1 md:block"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(`/search?q=${encodeURIComponent(q.trim())}`);
          }}
        >
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder='Search "milk", "atta", "paracetamol"…'
            className="h-11 w-full rounded-xl border bg-muted/60 pr-3 pl-10 text-sm outline-none focus:border-primary focus:bg-background"
            aria-label="Search products"
          />
        </form>
        <div className="ml-auto flex items-center gap-1">
          {user ? (
            <>
              <NotificationBell />
              <Button asChild variant="ghost" className="hidden sm:inline-flex">
                <Link href="/account">
                  <User /> {user.name?.split(" ")[0] ?? "Account"}
                </Link>
              </Button>
            </>
          ) : (
            <Button asChild variant="ghost">
              <Link href="/login">Login</Link>
            </Button>
          )}
          <Button asChild className="hidden h-11 rounded-xl px-4 sm:inline-flex">
            <Link href="/cart">
              <ShoppingBag />
              {cart.count > 0 ? (
                <span className="text-left leading-tight">
                  <span className="block text-xs">{cart.count} items</span>
                  <span className="block text-sm font-bold">{formatINR(cart.total)}</span>
                </span>
              ) : (
                "My Cart"
              )}
            </Link>
          </Button>
        </div>
      </div>
      <form
        className="relative px-4 pb-3 md:hidden"
        onSubmit={(e) => {
          e.preventDefault();
          router.push(`/search?q=${encodeURIComponent(q.trim())}`);
        }}
      >
        <Search className="absolute top-1/2 left-7 size-4 -translate-y-[calc(50%+6px)] text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search for products"
          className="h-10 w-full rounded-xl border bg-muted/60 pr-3 pl-10 text-sm outline-none focus:border-primary"
          aria-label="Search products"
        />
      </form>
    </header>
  );
}

export function MobileCartBar() {
  const { cart } = useCart();
  const path = usePathname();
  if (!cart.count || path.startsWith("/cart") || path.startsWith("/checkout")) return null;
  return (
    <Link
      href="/cart"
      className="fixed inset-x-3 bottom-[4.5rem] z-40 flex items-center justify-between rounded-2xl bg-primary px-4 py-3 text-primary-foreground shadow-xl sm:hidden"
    >
      <span className="flex items-center gap-2">
        <ShoppingBag className="size-5" />
        <span className="leading-tight">
          <span className="block text-xs opacity-90">
            {cart.count} item{cart.count > 1 ? "s" : ""} · {cart.shopName}
          </span>
          <span className="block font-bold">{formatINR(cart.total)}</span>
        </span>
      </span>
      <span className="font-bold">View cart →</span>
    </Link>
  );
}

export function BottomNav() {
  const path = usePathname();
  const items = [
    { href: "/", label: "Home", icon: Home },
    { href: "/categories", label: "Categories", icon: LayoutGrid },
    { href: "/orders", label: "Orders", icon: Package },
    { href: "/account", label: "Account", icon: User },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
      <ul className="grid grid-cols-4">
        {items.map((i) => {
          const active = i.href === "/" ? path === "/" : path.startsWith(i.href);
          return (
            <li key={i.href}>
              <Link href={i.href} className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold", active ? "text-primary" : "text-muted-foreground")}>
                <i.icon className="size-5" />
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
