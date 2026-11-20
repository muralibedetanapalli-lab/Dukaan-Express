"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bike, Loader2, Smartphone, Store } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { api, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { DeliveryModeKey } from "@/lib/delivery-mode";

const OPTIONS = [
  {
    value: "RIDER" as const,
    icon: Bike,
    title: "Dukaan Express rider",
    body: "When you pack an order, nearby riders are alerted and one picks it up. The customer tracks the rider live. The delivery fee goes to the rider.",
  },
  {
    value: "OWN" as const,
    icon: Store,
    title: "My own delivery staff",
    body: "You deliver orders yourself and keep the delivery fee. On cash orders you keep the cash; the platform commission is taken from your earnings.",
  },
  {
    value: "SELF_BOOKED" as const,
    icon: Smartphone,
    title: "I book Rapido / Ola",
    body: "You book a delivery app (Rapido, Ola, Porter…) for each order and pay for it. Customers pay no delivery fee. You confirm the handover with the customer's code.",
  },
];

const CHOSEN: Record<DeliveryModeKey, string> = {
  RIDER: "Dukaan Express riders will deliver your orders",
  OWN: "You'll deliver orders with your own staff",
  SELF_BOOKED: "You'll book Rapido / Ola for your orders; customers pay no delivery fee",
};

/** How this shop's orders are delivered (applies to orders packed after the change). */
export function DeliveryModeCard({ mode }: { mode: DeliveryModeKey }) {
  const router = useRouter();
  const [value, setValue] = useState(mode);
  const [busy, setBusy] = useState(false);

  async function choose(next: DeliveryModeKey) {
    if (next === value || busy) return;
    setBusy(true);
    try {
      await api("/shop/me", { method: "PATCH", body: { deliveryMode: next } });
      setValue(next);
      toast.success(CHOSEN[next]);
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="gap-3 p-4">
      <div>
        <p className="flex items-center gap-2 font-semibold">
          Delivery {busy && <Loader2 className="size-4 animate-spin" />}
        </p>
        <p className="text-xs text-muted-foreground">Applies to orders you pack from now on. The delivery fee change applies to new orders.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Delivery mode">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => choose(o.value)}
            className={cn("rounded-xl border p-3 text-left transition-colors", value === o.value ? "border-primary bg-secondary" : "hover:bg-muted/50")}
          >
            <p className="flex items-center gap-2 text-sm font-semibold">
              <o.icon className={cn("size-4", value === o.value && "text-primary")} /> {o.title}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{o.body}</p>
          </button>
        ))}
      </div>
    </Card>
  );
}
