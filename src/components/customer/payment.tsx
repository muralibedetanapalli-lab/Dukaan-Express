"use client";

import { useCallback, useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SandboxBadge } from "@/components/shared/misc";
import { api } from "@/lib/api-client";
import { formatINR } from "@/lib/money";

interface CheckoutOptions {
  mode: "live" | "sandbox";
  cashfreeMode: "sandbox" | "production";
  paymentSessionId: string;
  gatewayOrderId: string;
  amount: number;
  currency: string;
  orderNumber: string;
  name: string;
}

type Outcome = "paid" | "failed" | "dismissed";

interface CashfreeCheckoutResult {
  error?: { message?: string };
  redirect?: boolean;
  paymentDetails?: { paymentMessage?: string };
}

declare global {
  interface Window {
    Cashfree?: (opts: { mode: "sandbox" | "production" }) => {
      checkout: (opts: { paymentSessionId: string; redirectTarget?: string }) => Promise<CashfreeCheckoutResult>;
    };
  }
}

function loadCashfree(): Promise<void> {
  if (window.Cashfree) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load Cashfree checkout"));
    document.body.appendChild(s);
  });
}

/** Asks the server (which asks Cashfree) how a payment ended. The browser's view is never trusted. */
export async function confirmPayment(orderId: string, gatewayOrderId?: string): Promise<Outcome> {
  const r = await api<{ outcome: "paid" | "failed" | "pending" }>("/payments/verify", { body: { orderId, ...(gatewayOrderId ? { gatewayOrderId } : {}) } });
  return r.outcome === "pending" ? "dismissed" : r.outcome;
}

/**
 * Opens Cashfree Checkout (live) or the in-app sandbox checkout, then confirms the result on the
 * server. Resolves "paid" | "failed" | "dismissed".
 */
export function usePayment() {
  const [sandbox, setSandbox] = useState<{ opts: CheckoutOptions; orderId: string; resolve: (r: Outcome) => void } | null>(null);
  const [busy, setBusy] = useState(false);

  const pay = useCallback(async (orderId: string): Promise<Outcome> => {
    const opts = await api<CheckoutOptions>(`/orders/${orderId}/pay`, { method: "POST" });
    if (opts.mode === "sandbox") {
      return new Promise((resolve) => setSandbox({ opts, orderId, resolve }));
    }
    await loadCashfree();
    const cashfree = window.Cashfree!({ mode: opts.cashfreeMode });
    const result = await cashfree.checkout({ paymentSessionId: opts.paymentSessionId, redirectTarget: "_modal" });
    // Some in-app browsers can't show the popup: Cashfree then navigates away and comes back to
    // /orders/{id}?payment=return, where the order page confirms the payment.
    if (result.redirect) return new Promise<Outcome>(() => {});
    return confirmPayment(orderId, opts.gatewayOrderId);
  }, []);

  async function sandboxComplete(outcome: "success" | "failure") {
    if (!sandbox) return;
    setBusy(true);
    try {
      const r = await api<{ outcome: "paid" | "failed" | "pending" }>("/payments/verify", {
        body: { orderId: sandbox.orderId, gatewayOrderId: sandbox.opts.gatewayOrderId, sandboxOutcome: outcome },
      });
      sandbox.resolve(r.outcome === "paid" ? "paid" : "failed");
    } catch {
      sandbox.resolve("failed");
    } finally {
      setBusy(false);
      setSandbox(null);
    }
  }

  const dialog = (
    <Dialog
      open={!!sandbox}
      onOpenChange={(o) => {
        if (!o && sandbox && !busy) {
          sandbox.resolve("dismissed");
          setSandbox(null);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="size-5" /> Payment <SandboxBadge />
          </DialogTitle>
          <DialogDescription>
            Cashfree credentials are not configured, so this isolated sandbox simulates the payment gateway. No money is charged. Set CASHFREE_APP_ID / CASHFREE_SECRET_KEY to use
            real Cashfree Checkout.
          </DialogDescription>
        </DialogHeader>
        {sandbox && (
          <div className="rounded-xl border bg-muted/50 p-4 text-sm">
            <p>
              Order <b>{sandbox.opts.orderNumber}</b>
            </p>
            <p className="mt-1 text-2xl font-bold">{formatINR(sandbox.opts.amount)}</p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{sandbox.opts.gatewayOrderId}</p>
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <Button size="lg" onClick={() => sandboxComplete("success")} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />} Simulate success
          </Button>
          <Button size="lg" variant="outline" onClick={() => sandboxComplete("failure")} disabled={busy}>
            Simulate failure
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return { pay, dialog };
}
