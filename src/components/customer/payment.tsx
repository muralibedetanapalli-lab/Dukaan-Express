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
  keyId: string;
  razorpayOrderId: string;
  amount: number;
  currency: string;
  orderNumber: string;
  name: string;
  preferredMethod: string | null;
  prefill: { name: string; contact: string; email: string };
}

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void; on: (ev: string, cb: (r: unknown) => void) => void };
  }
}

function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load Razorpay checkout"));
    document.body.appendChild(s);
  });
}

/**
 * Opens Razorpay Checkout (live) or the in-app sandbox checkout, then verifies the payment on the
 * server. Resolves "paid" | "failed" | "dismissed".
 */
export function usePayment() {
  const [sandbox, setSandbox] = useState<{ opts: CheckoutOptions; orderId: string; resolve: (r: "paid" | "failed" | "dismissed") => void } | null>(null);
  const [busy, setBusy] = useState(false);

  const pay = useCallback(async (orderId: string): Promise<"paid" | "failed" | "dismissed"> => {
    const opts = await api<CheckoutOptions>(`/orders/${orderId}/pay`, { method: "POST" });
    if (opts.mode === "sandbox") {
      return new Promise((resolve) => setSandbox({ opts, orderId, resolve }));
    }
    await loadRazorpay();
    return new Promise((resolve) => {
      const rzp = new window.Razorpay!({
        key: opts.keyId,
        amount: opts.amount,
        currency: opts.currency,
        name: opts.name,
        description: `Order ${opts.orderNumber}`,
        order_id: opts.razorpayOrderId,
        prefill: { ...opts.prefill, ...(opts.preferredMethod ? { method: opts.preferredMethod } : {}) },
        theme: { color: "#15803d" },
        handler: async (r: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          try {
            await api("/payments/verify", {
              body: { orderId, razorpayOrderId: r.razorpay_order_id, razorpayPaymentId: r.razorpay_payment_id, razorpaySignature: r.razorpay_signature },
            });
            resolve("paid");
          } catch {
            resolve("failed");
          }
        },
        modal: { ondismiss: () => resolve("dismissed") },
      });
      rzp.on("payment.failed", () => resolve("failed"));
      rzp.open();
    });
  }, []);

  async function sandboxComplete(outcome: "success" | "failure") {
    if (!sandbox) return;
    setBusy(true);
    try {
      await api("/payments/verify", { body: { orderId: sandbox.orderId, razorpayOrderId: sandbox.opts.razorpayOrderId, sandboxOutcome: outcome } });
      sandbox.resolve("paid");
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
            Razorpay credentials are not configured, so this isolated sandbox simulates the payment gateway. No money is charged. Configure RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET to use real
            Razorpay Checkout.
          </DialogDescription>
        </DialogHeader>
        {sandbox && (
          <div className="rounded-xl border bg-muted/50 p-4 text-sm">
            <p>
              Order <b>{sandbox.opts.orderNumber}</b>
            </p>
            <p className="mt-1 text-2xl font-bold">{formatINR(sandbox.opts.amount)}</p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{sandbox.opts.razorpayOrderId}</p>
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
