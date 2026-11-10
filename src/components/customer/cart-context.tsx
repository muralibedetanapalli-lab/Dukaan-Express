"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api, ApiError, errorMessage } from "@/lib/api-client";

export interface CartSummary {
  shopId: string | null;
  shopName: string | null;
  lines: Record<string, number>; // inventoryId → qty
  count: number;
  total: number;
}

interface CartViewLite {
  shop: { id: string; name: string } | null;
  items: { inventoryId: string; quantity: number }[];
  quote: { total: number };
}

function summarize(v: CartViewLite): CartSummary {
  return {
    shopId: v.shop?.id ?? null,
    shopName: v.shop?.name ?? null,
    lines: Object.fromEntries(v.items.map((i) => [i.inventoryId, i.quantity])),
    count: v.items.reduce((s, i) => s + i.quantity, 0),
    total: v.quote.total,
  };
}

interface Ctx {
  cart: CartSummary;
  loggedIn: boolean;
  pending: string | null;
  add: (inventoryId: string, qty?: number) => Promise<void>;
  setQty: (inventoryId: string, qty: number) => Promise<void>;
  refresh: () => Promise<void>;
}

const CartCtx = createContext<Ctx | null>(null);

export function CartProvider({ initial, loggedIn, children }: { initial: CartSummary; loggedIn: boolean; children: React.ReactNode }) {
  const router = useRouter();
  const [cart, setCart] = useState(initial);
  const [pending, setPending] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ inventoryId: string; qty: number; currentShop: string; newShop: string } | null>(null);

  const requireLogin = useCallback(() => {
    toast.info("Log in to add items to your cart");
    router.push(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }, [router]);

  const add = useCallback(
    async (inventoryId: string, qty = 1, replaceCart = false) => {
      if (!loggedIn) return requireLogin();
      setPending(inventoryId);
      try {
        const v = await api<CartViewLite>("/cart", { body: { inventoryId, quantity: qty, replaceCart } });
        setCart(summarize(v));
        if (replaceCart) toast.success("Cart replaced with items from the new shop");
        router.refresh();
      } catch (e) {
        const d = e instanceof ApiError ? (e.details as { reason?: string; currentShop?: string; newShop?: string } | undefined) : undefined;
        if (d?.reason === "CART_SHOP_CONFLICT") {
          setConflict({ inventoryId, qty, currentShop: d.currentShop!, newShop: d.newShop! });
        } else toast.error(errorMessage(e));
      } finally {
        setPending(null);
      }
    },
    [loggedIn, requireLogin, router],
  );

  const setQty = useCallback(
    async (inventoryId: string, quantity: number) => {
      if (!loggedIn) return requireLogin();
      setPending(inventoryId);
      try {
        const v = await api<CartViewLite>("/cart", { method: "PATCH", body: { inventoryId, quantity } });
        setCart(summarize(v));
        router.refresh();
      } catch (e) {
        toast.error(errorMessage(e));
      } finally {
        setPending(null);
      }
    },
    [loggedIn, requireLogin, router],
  );

  const refresh = useCallback(async () => {
    if (!loggedIn) return;
    const v = await api<CartViewLite>("/cart");
    setCart(summarize(v));
  }, [loggedIn]);

  const value = useMemo(() => ({ cart, loggedIn, pending, add: (id: string, q?: number) => add(id, q), setQty, refresh }), [cart, loggedIn, pending, add, setQty, refresh]);

  return (
    <CartCtx.Provider value={value}>
      {children}
      <AlertDialog open={!!conflict} onOpenChange={(o) => !o && setConflict(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start a new cart?</AlertDialogTitle>
            <AlertDialogDescription>
              Your cart has items from <b>{conflict?.currentShop}</b>. Orders can include items from one shop at a time. Place your current order first, or clear the cart to add
              items from <b>{conflict?.newShop}</b>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep current cart</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const c = conflict!;
                setConflict(null);
                void add(c.inventoryId, c.qty, true);
              }}
            >
              Clear cart & add
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CartCtx.Provider>
  );
}

export function useCart() {
  const c = useContext(CartCtx);
  if (!c) throw new Error("useCart must be used inside CartProvider");
  return c;
}
