"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Building2, Check, CreditCard, Loader2, MapPin, Plus, Smartphone, Store } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { BillSummary } from "@/components/customer/bill-summary";
import { AddressForm } from "@/components/customer/address-form";
import { usePayment } from "@/components/customer/payment";
import { useCart } from "@/components/customer/cart-context";
import { SandboxBadge } from "@/components/shared/misc";
import { api, errorMessage } from "@/lib/api-client";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { CartView } from "@/server/services/cart";

interface Addr {
  id: string;
  label: string;
  name: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  pincode: string;
  latitude: number;
  longitude: number;
}

type Method = "UPI" | "CARD" | "NETBANKING" | "COD";

export function CheckoutClient({
  cart,
  addresses,
  selectedAddressId,
  profile,
  payments,
  sandbox,
}: {
  cart: CartView;
  addresses: Addr[];
  selectedAddressId: string | null;
  profile: { name: string; phone: string };
  payments: { onlineEnabled: boolean; upi: boolean; card: boolean; netbanking: boolean; codEnabled: boolean; codMaxAmount: number };
  sandbox: boolean;
}) {
  const router = useRouter();
  const { refresh } = useCart();
  const { pay, dialog } = usePayment();
  const [addressId, setAddressId] = useState(selectedAddressId);
  const [adding, setAdding] = useState(addresses.length === 0);
  const [switching, setSwitching] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [placing, setPlacing] = useState(false);
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  const methods: { key: Method; label: string; icon: typeof Smartphone; enabled: boolean; hint?: string }[] = [
    { key: "UPI", label: "UPI", icon: Smartphone, enabled: payments.onlineEnabled && payments.upi, hint: "GPay, PhonePe, Paytm & more" },
    { key: "CARD", label: "Credit / Debit card", icon: CreditCard, enabled: payments.onlineEnabled && payments.card },
    { key: "NETBANKING", label: "Net banking", icon: Building2, enabled: payments.onlineEnabled && payments.netbanking },
    {
      key: "COD",
      label: "Cash on delivery",
      icon: Banknote,
      enabled: payments.codEnabled && cart.quote.total <= payments.codMaxAmount,
      hint: payments.codEnabled && cart.quote.total > payments.codMaxAmount ? `Available for orders up to ${formatINR(payments.codMaxAmount)}` : undefined,
    },
  ];
  const [method, setMethod] = useState<Method | null>(methods.find((m) => m.enabled)?.key ?? null);

  async function selectAddress(a: Addr) {
    setSwitching(a.id);
    try {
      // Re-quote for this address (distance-based delivery fee and serviceability).
      await api("/location", { body: { lat: a.latitude, lng: a.longitude, label: `${a.label} · ${a.line1}`, pincode: a.pincode, addressId: a.id } });
      setAddressId(a.id);
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSwitching(null);
    }
  }

  async function placeOrder() {
    if (!addressId) return toast.error("Choose a delivery address");
    if (!method) return toast.error("Choose a payment method");
    setPlacing(true);
    try {
      const r = await api<{ order: { id: string; orderNumber: string } }>("/orders", {
        body: { addressId, paymentMethod: method, notes: notes || null },
        headers: { "Idempotency-Key": idempotencyKey },
      });
      await refresh();
      if (method === "COD") {
        toast.success(`Order ${r.order.orderNumber} placed!`);
        router.replace(`/orders/${r.order.id}?placed=1`);
        return;
      }
      const result = await pay(r.order.id);
      if (result === "paid") toast.success("Payment successful — order placed!");
      else if (result === "failed") toast.error("Payment failed. You can retry from the order page.");
      else toast.info("Payment not completed. You can pay from the order page.");
      router.replace(`/orders/${r.order.id}${result === "paid" ? "?placed=1" : ""}`);
    } catch (e) {
      toast.error(errorMessage(e));
      setPlacing(false);
    }
  }

  const blockers = cart.blockers;

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
      {dialog}
      <div className="space-y-5">
        <h1 className="text-xl font-bold">Checkout</h1>

        <Card className="gap-3 p-4">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 font-semibold">
              <MapPin className="size-5 text-primary" /> Delivery address
            </p>
            {!adding && (
              <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
                <Plus /> Add new
              </Button>
            )}
          </div>
          <div className="grid gap-2">
            {addresses.map((a) => (
              <button
                key={a.id}
                onClick={() => selectAddress(a)}
                disabled={!!switching}
                className={cn("flex items-start gap-3 rounded-xl border p-3 text-left transition", addressId === a.id ? "border-primary bg-secondary/40" : "hover:bg-muted")}
              >
                <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border", addressId === a.id && "border-primary bg-primary text-primary-foreground")}>
                  {switching === a.id ? <Loader2 className="size-3 animate-spin" /> : addressId === a.id && <Check className="size-3" />}
                </span>
                <span className="min-w-0 text-sm">
                  <span className="font-semibold">{a.label}</span> · {a.name}, {a.phone}
                  <span className="block text-muted-foreground">
                    {a.line1}
                    {a.line2 ? `, ${a.line2}` : ""}
                    {a.landmark ? ` (${a.landmark})` : ""}, {a.city} {a.pincode}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </Card>

        <Card className="gap-3 p-4">
          <p className="flex items-center gap-2 font-semibold">
            <CreditCard className="size-5 text-primary" /> Payment method {sandbox && <SandboxBadge label="Razorpay sandbox" />}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {methods.map((m) => (
              <button
                key={m.key}
                disabled={!m.enabled}
                onClick={() => setMethod(m.key)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50",
                  method === m.key ? "border-primary bg-secondary/40" : "hover:bg-muted",
                )}
              >
                <m.icon className="size-5 shrink-0 text-primary" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{m.label}</span>
                  {m.hint && <span className="block text-xs text-muted-foreground">{m.hint}</span>}
                  {!m.enabled && !m.hint && <span className="block text-xs text-muted-foreground">Currently unavailable</span>}
                </span>
              </button>
            ))}
          </div>
        </Card>

        <Card className="gap-2 p-4">
          <p className="font-semibold">Delivery instructions (optional)</p>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} rows={2} placeholder="e.g. Leave at the door, call on arrival" />
        </Card>
      </div>

      <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        {cart.shop && (
          <Card className="gap-2 p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold">
              <Store className="size-4 text-primary" /> {cart.shop.name}
            </p>
            <ul className="space-y-1 text-muted-foreground">
              {cart.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-2">
                  <span className="truncate">
                    {i.quantity} × {i.name}
                  </span>
                  <span>{formatINR(i.lineTotal)}</span>
                </li>
              ))}
            </ul>
            {cart.shop.etaMinutes != null && <p className="text-xs font-semibold text-primary">Estimated delivery: {cart.shop.etaMinutes} minutes</p>}
          </Card>
        )}
        <BillSummary quote={cart.quote} />
        {blockers.length > 0 && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{blockers.join(" · ")}</p>}
        <Button size="lg" className="h-12 w-full text-base" onClick={placeOrder} disabled={placing || !cart.canCheckout || !addressId || !method}>
          {placing && <Loader2 className="animate-spin" />}
          {method === "COD" ? "Place order" : "Pay"} · {formatINR(cart.quote.total)}
        </Button>
        <p className="text-center text-xs text-muted-foreground">Prices and totals are verified on our servers when you place the order.</p>
      </div>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add delivery address</DialogTitle>
          </DialogHeader>
          <AddressForm
            initial={{ name: profile.name, phone: profile.phone }}
            onCancel={addresses.length ? () => setAdding(false) : undefined}
            onSaved={async (a) => {
              setAdding(false);
              const full = await api<{ addresses: Addr[] }>("/customer/addresses");
              const created = full.addresses.find((x) => x.id === a.id);
              if (created) await selectAddress(created);
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
