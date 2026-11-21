"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bike, Loader2, Minus, Package, Plus, Search, ShoppingCart, Store, Wallet, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pill } from "@/components/shared/status-badge";
import { usePayment } from "@/components/customer/payment";
import { api, errorMessage } from "@/lib/api-client";
import { discountPercent, formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";

type Item = {
  inventoryId: string;
  name: string;
  variant: string | null;
  unit: string;
  category: string;
  image: string | null;
  mrp: number;
  retailPrice: number;
  bulkPrice: number;
  minQty: number;
  stock: number;
};
type Seller = { id: string; name: string; minOrder: number; delivers: boolean; deliveryFee: number; pickup: boolean; payOnDelivery: boolean };

/** Wholesaler catalogue with quantity steppers (respecting minimums) and checkout. */
export function BulkCart({ shop, items, buyerLive }: { shop: Seller; items: Item[]; buyerLive: boolean }) {
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [fulfilment, setFulfilment] = useState<"DELIVERY" | "PICKUP">(shop.delivers ? "DELIVERY" : "PICKUP");
  const [payment, setPayment] = useState<"ONLINE" | "ON_DELIVERY">("ONLINE");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const { pay, dialog } = usePayment({ start: (id) => `/shop/bulk/orders/${id}/pay`, verify: (id) => `/shop/bulk/orders/${id}/verify` });

  const lines = items.filter((i) => (qty[i.inventoryId] ?? 0) > 0);
  const subtotal = lines.reduce((s, i) => s + i.bulkPrice * qty[i.inventoryId], 0);
  const units = lines.reduce((s, i) => s + qty[i.inventoryId], 0);
  const fee = fulfilment === "DELIVERY" ? shop.deliveryFee : 0;
  const short = Math.max(0, shop.minOrder - subtotal);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? items.filter((i) => `${i.name} ${i.category} ${i.variant ?? ""}`.toLowerCase().includes(t)) : items;
  }, [items, q]);

  const set = (i: Item, n: number) => {
    const v = n <= 0 ? 0 : Math.min(i.stock, Math.max(i.minQty, n));
    setQty((p) => ({ ...p, [i.inventoryId]: v }));
  };
  const step = (i: Item) => Math.max(1, Math.round(i.minQty / 2));

  async function place() {
    setBusy(true);
    try {
      const o = await api<{ id: string; status: string }>("/shop/bulk/orders", {
        body: {
          sellerShopId: shop.id,
          items: lines.map((i) => ({ inventoryId: i.inventoryId, quantity: qty[i.inventoryId] })),
          fulfilment,
          paymentMethod: payment,
          note: note || null,
        },
      });
      setOpen(false);
      if (o.status === "PAYMENT_PENDING") {
        const outcome = await pay(o.id).catch(() => "failed" as const);
        if (outcome === "paid") toast.success("Paid. Your order is with the seller.");
        else if (outcome === "failed") toast.error("Payment failed. You can retry from the order page.");
        else toast.message("Payment not completed. You can pay from the order page.");
      } else {
        toast.success("Bulk order sent to the seller");
      }
      router.push(`/shop/bulk/orders/${o.id}`);
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 pb-28">
      <div className="flex flex-wrap gap-1.5">
        {shop.minOrder > 0 && <Pill>Minimum order {formatINR(shop.minOrder)}</Pill>}
        {shop.delivers && (
          <Pill tone="primary">
            <Bike className="size-3" /> Delivers · {shop.deliveryFee ? formatINR(shop.deliveryFee) : "free"}
          </Pill>
        )}
        {shop.pickup && (
          <Pill>
            <Store className="size-3" /> Pickup available
          </Pill>
        )}
        {shop.payOnDelivery && (
          <Pill>
            <Wallet className="size-3" /> Pay on delivery
          </Pill>
        )}
      </div>

      {items.length > 6 && (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this wholesaler's products" className="pl-9" />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {shown.map((i) => {
          const n = qty[i.inventoryId] ?? 0;
          const off = discountPercent(i.retailPrice, i.bulkPrice);
          return (
            <Card key={i.inventoryId} className={cn("flex-row gap-3 p-3", n > 0 && "border-primary/50 bg-primary/5")}>
              {i.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={i.image} alt="" className="size-20 shrink-0 rounded-xl border bg-white object-contain" />
              ) : (
                <span className="grid size-20 shrink-0 place-items-center rounded-xl bg-muted">
                  <Package className="size-7 text-muted-foreground" />
                </span>
              )}
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="line-clamp-2 text-sm font-semibold">{i.name}</p>
                <p className="text-xs text-muted-foreground">
                  {i.variant ?? i.unit} · {i.category}
                </p>
                <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
                  <span className="font-bold">{formatINR(i.bulkPrice)}</span>
                  <span className="text-xs text-muted-foreground">/unit</span>
                  <span className="text-xs text-muted-foreground line-through">{formatINR(i.retailPrice)}</span>
                  {off > 0 && <span className="text-xs font-semibold text-emerald-600">{off}% below retail</span>}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Min {i.minQty} · {i.stock} in stock
                </p>
                <div className="mt-auto flex items-center justify-end pt-2">
                  {n === 0 ? (
                    <Button size="sm" variant="outline" onClick={() => set(i, i.minQty)} disabled={i.stock < i.minQty}>
                      {i.stock < i.minQty ? "Not enough stock" : `Add ${i.minQty}`}
                    </Button>
                  ) : (
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="outline"
                        className="size-8"
                        onClick={() => set(i, n - step(i) < i.minQty ? 0 : n - step(i))}
                        aria-label="Less"
                      >
                        <Minus className="size-4" />
                      </Button>
                      <Input
                        value={n}
                        onChange={(e) => setQty((p) => ({ ...p, [i.inventoryId]: Number(e.target.value.replace(/\D/g, "")) || 0 }))}
                        onBlur={() => set(i, n)}
                        inputMode="numeric"
                        className="h-8 w-16 text-center font-semibold"
                        aria-label={`Quantity of ${i.name}`}
                      />
                      <Button size="icon" className="size-8" onClick={() => set(i, n + step(i))} disabled={n >= i.stock} aria-label="More">
                        <Plus className="size-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {lines.length > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-30 px-4 md:bottom-4">
          <div className="mx-auto flex max-w-5xl items-center gap-3 rounded-2xl bg-slate-900 p-3 pl-4 text-white shadow-2xl">
            <ShoppingCart className="size-5 shrink-0" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-bold">
                {formatINR(subtotal)} · {units} units
              </p>
              <p className="truncate text-xs text-slate-300">
                {short > 0 ? `Add ${formatINR(short)} more to reach the minimum order` : `${lines.length} product${lines.length === 1 ? "" : "s"}`}
              </p>
            </div>
            <Button onClick={() => setOpen(true)} disabled={short > 0 || !buyerLive} className="bg-white text-slate-900 hover:bg-slate-100">
              Review order
            </Button>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk order from {shop.name}</DialogTitle>
            <DialogDescription>Check the items, choose how you get them and how you pay.</DialogDescription>
          </DialogHeader>
          <div className="divide-y rounded-xl border text-sm">
            {lines.map((i) => (
              <div key={i.inventoryId} className="flex items-center justify-between gap-3 p-2.5">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{i.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {qty[i.inventoryId]} × {formatINR(i.bulkPrice)}
                  </span>
                </span>
                <span className="font-semibold tabular-nums">{formatINR(i.bulkPrice * qty[i.inventoryId])}</span>
              </div>
            ))}
          </div>

          <p className="text-sm font-semibold">How will you get it?</p>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["DELIVERY", Bike, "Seller delivers", shop.deliveryFee ? formatINR(shop.deliveryFee) : "Free", shop.delivers],
                ["PICKUP", Store, "I'll pick up", "No charge", shop.pickup],
              ] as const
            ).map(([k, Icon, label, sub, ok]) => (
              <button
                key={k}
                type="button"
                disabled={!ok}
                onClick={() => setFulfilment(k)}
                className={cn(
                  "rounded-xl border p-3 text-left text-sm transition disabled:opacity-40",
                  fulfilment === k ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted",
                )}
              >
                <Icon className="mb-1 size-5 text-primary" />
                <span className="block font-semibold">{label}</span>
                <span className="text-xs text-muted-foreground">{ok ? sub : "Not offered"}</span>
              </button>
            ))}
          </div>

          <p className="text-sm font-semibold">Payment</p>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["ONLINE", CreditCard, "Pay now", "UPI, card, netbanking", true],
                ["ON_DELIVERY", Wallet, fulfilment === "PICKUP" ? "Pay at pickup" : "Pay on delivery", "Cash or UPI to the seller", shop.payOnDelivery],
              ] as const
            ).map(([k, Icon, label, sub, ok]) => (
              <button
                key={k}
                type="button"
                disabled={!ok}
                onClick={() => setPayment(k)}
                className={cn(
                  "rounded-xl border p-3 text-left text-sm transition disabled:opacity-40",
                  payment === k ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted",
                )}
              >
                <Icon className="mb-1 size-5 text-primary" />
                <span className="block font-semibold">{label}</span>
                <span className="text-xs text-muted-foreground">{ok ? sub : "Not offered"}</span>
              </button>
            ))}
          </div>

          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note for the seller (optional), e.g. deliver before 10 am"
            maxLength={500}
            rows={2}
          />

          <div className="space-y-1 rounded-xl bg-muted/60 p-3 text-sm">
            <p className="flex justify-between">
              <span>Items ({units} units)</span>
              <span className="tabular-nums">{formatINR(subtotal)}</span>
            </p>
            <p className="flex justify-between">
              <span>Delivery</span>
              <span className="tabular-nums">{fee ? formatINR(fee) : "Free"}</span>
            </p>
            <p className="flex justify-between border-t pt-1 text-base font-bold">
              <span>Total</span>
              <span className="tabular-nums">{formatINR(subtotal + fee)}</span>
            </p>
          </div>
          <Button size="lg" onClick={place} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {payment === "ONLINE" ? `Pay ${formatINR(subtotal + fee)}` : "Place order"}
          </Button>
        </DialogContent>
      </Dialog>
      {dialog}
    </div>
  );
}
