"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, TicketPercent, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api-client";
import { useCart } from "@/components/customer/cart-context";
import { ConfirmButton } from "@/components/shared/confirm-button";

export function CouponBox({ applied, error, coupons }: { applied: string | null; error: string | null; coupons: { code: string; description: string | null }[] }) {
  const router = useRouter();
  const { refresh } = useCart();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function apply(c: string | null) {
    setBusy(true);
    try {
      await api("/cart", { method: "PATCH", body: { couponCode: c } });
      if (c) toast.success(`Coupon ${c} applied`);
      setCode("");
      await refresh();
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="gap-3 p-4">
      <p className="flex items-center gap-2 font-semibold">
        <TicketPercent className="size-5 text-primary" /> Coupons & offers
      </p>
      {applied ? (
        <div className="flex items-center justify-between rounded-xl border border-dashed border-primary bg-secondary/50 px-3 py-2">
          <div>
            <p className="font-mono font-bold">{applied}</p>
            {error ? <p className="text-xs text-destructive">{error}</p> : <p className="text-xs text-primary">Applied</p>}
          </div>
          <Button variant="ghost" size="icon-sm" onClick={() => apply(null)} disabled={busy} aria-label="Remove coupon">
            <X />
          </Button>
        </div>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) void apply(code.trim().toUpperCase());
          }}
        >
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Enter coupon code" className="font-mono" maxLength={20} />
          <Button type="submit" variant="outline" disabled={busy || !code.trim()}>
            {busy ? <Loader2 className="animate-spin" /> : "Apply"}
          </Button>
        </form>
      )}
      {!applied && coupons.length > 0 && (
        <ul className="space-y-2">
          {coupons.map((c) => (
            <li key={c.code} className="flex items-center justify-between gap-2 text-sm">
              <div className="min-w-0">
                <p className="font-mono text-xs font-bold">{c.code}</p>
                <p className="truncate text-xs text-muted-foreground">{c.description}</p>
              </div>
              <Button size="xs" variant="ghost" className="text-primary" onClick={() => apply(c.code)} disabled={busy}>
                Apply
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function ClearCartButton() {
  const router = useRouter();
  const { refresh } = useCart();
  return (
    <ConfirmButton
      variant="ghost"
      size="sm"
      title="Clear your cart?"
      description="All items will be removed."
      confirmLabel="Clear cart"
      destructive
      onConfirm={async () => {
        await api("/cart", { method: "DELETE" });
        await refresh();
        router.refresh();
      }}
    >
      Clear cart
    </ConfirmButton>
  );
}
