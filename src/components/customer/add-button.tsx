"use client";

import { Loader2, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCart } from "./cart-context";

export function AddButton({
  inventoryId,
  maxQty,
  disabled,
  size = "md",
  className,
}: {
  inventoryId: string;
  maxQty: number;
  disabled?: boolean;
  size?: "md" | "lg";
  className?: string;
}) {
  const { cart, add, setQty, pending } = useCart();
  const qty = cart.lines[inventoryId] ?? 0;
  const busy = pending === inventoryId;
  const h = size === "lg" ? "h-11 text-base" : "h-8 text-sm";

  if (disabled) {
    return <div className={cn("grid place-items-center rounded-lg border px-3 text-xs font-semibold text-muted-foreground", h, className)}>Unavailable</div>;
  }
  if (qty === 0) {
    return (
      <button
        type="button"
        onClick={() => add(inventoryId, 1)}
        disabled={busy}
        className={cn(
          "inline-flex min-w-18 items-center justify-center rounded-lg border-2 border-primary bg-primary/5 px-4 font-bold text-primary transition hover:bg-primary hover:text-primary-foreground",
          h,
          className,
        )}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : "ADD"}
      </button>
    );
  }
  return (
    <div className={cn("inline-flex min-w-18 items-center justify-between rounded-lg bg-primary font-bold text-primary-foreground", h, className)}>
      <button type="button" onClick={() => setQty(inventoryId, qty - 1)} disabled={busy} className="grid h-full place-items-center px-2" aria-label="Decrease quantity">
        <Minus className="size-3.5" />
      </button>
      <span className="min-w-5 text-center tabular-nums">{busy ? <Loader2 className="mx-auto size-3.5 animate-spin" /> : qty}</span>
      <button
        type="button"
        onClick={() => setQty(inventoryId, qty + 1)}
        disabled={busy || qty >= maxQty}
        className="grid h-full place-items-center px-2 disabled:opacity-50"
        aria-label="Increase quantity"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
