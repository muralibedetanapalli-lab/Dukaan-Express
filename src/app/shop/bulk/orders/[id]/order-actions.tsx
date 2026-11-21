"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, CreditCard, Loader2, PackageCheck, Truck, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { confirmPayment, usePayment } from "@/components/customer/payment";
import { api, errorMessage } from "@/lib/api-client";
import type { BulkStatus } from "@/lib/bulk";
import { formatINR } from "@/lib/money";

type Props = {
  id: string;
  side: "buyer" | "seller";
  status: BulkStatus;
  fulfilment: "DELIVERY" | "PICKUP";
  paymentMethod: "ONLINE" | "ON_DELIVERY";
  total: number;
};

/** What the buyer or the seller can do next, as one clear prompt. */
export function BulkOrderActions({ id, side, status, fulfilment, paymentMethod, total }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [busy, setBusy] = useState<string | null>(null);
  const [reasonFor, setReasonFor] = useState<null | { action: "reject" | "cancel"; title: string }>(null);
  const [reason, setReason] = useState("");
  const { pay, dialog } = usePayment({ start: (x) => `/shop/bulk/orders/${x}/pay`, verify: (x) => `/shop/bulk/orders/${x}/verify` });
  const checked = useRef(false);
  const pickup = fulfilment === "PICKUP";

  // Back from Cashfree's redirect flow: confirm with the server.
  useEffect(() => {
    if (checked.current || params.get("payment") !== "return" || status !== "PAYMENT_PENDING") return;
    checked.current = true;
    confirmPayment(id, undefined, `/shop/bulk/orders/${id}/verify`)
      .then((o) => (o === "paid" ? toast.success("Payment received") : o === "failed" ? toast.error("Payment failed") : null))
      .finally(() => router.replace(`/shop/bulk/orders/${id}`));
  }, [id, params, router, status]);

  async function act(body: Record<string, unknown>, ok: string) {
    setBusy(String(body.action));
    try {
      await api(`/shop/bulk/orders/${id}/actions`, { body });
      toast.success(ok);
      setReasonFor(null);
      setReason("");
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function payNow() {
    setBusy("pay");
    try {
      const o = await pay(id);
      if (o === "paid") toast.success("Paid. Your order is with the seller.");
      else if (o === "failed") toast.error("Payment failed. Please try again.");
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const spin = (k: string) => (busy === k ? <Loader2 className="size-4 animate-spin" /> : null);
  let prompt: { text: string; buttons: React.ReactNode } | null = null;

  if (side === "seller") {
    if (status === "PLACED")
      prompt = {
        text: "New bulk order. Accept it to reserve the stock, or reject it.",
        buttons: (
          <>
            <Button variant="outline" onClick={() => setReasonFor({ action: "reject", title: "Reject this order?" })} disabled={!!busy}>
              <X className="size-4" /> Reject
            </Button>
            <Button onClick={() => act({ action: "accept" }, "Accepted. Stock reserved.")} disabled={!!busy}>
              {spin("accept") ?? <CheckCircle2 className="size-4" />} Accept order
            </Button>
          </>
        ),
      };
    else if (status === "ACCEPTED")
      prompt = {
        text: pickup ? "Pack the items, then tell the buyer it's ready to collect." : "Pack the items and send them out.",
        buttons: (
          <>
            <Button variant="ghost" onClick={() => setReasonFor({ action: "cancel", title: "Can't fulfil this order?" })} disabled={!!busy}>
              Cancel order
            </Button>
            <Button
              onClick={() => act({ action: pickup ? "ready" : "dispatch" }, pickup ? "Buyer told it's ready" : "Marked out for delivery")}
              disabled={!!busy}
            >
              {spin(pickup ? "ready" : "dispatch") ?? (pickup ? <PackageCheck className="size-4" /> : <Truck className="size-4" />)}
              {pickup ? "Ready for pickup" : "Out for delivery"}
            </Button>
          </>
        ),
      };
    else if (status === "DISPATCHED" || status === "READY_FOR_PICKUP")
      prompt = {
        text:
          paymentMethod === "ON_DELIVERY"
            ? `Collect ${formatINR(total)} from the buyer, then mark it ${pickup ? "picked up" : "delivered"}.`
            : `Mark it ${pickup ? "picked up" : "delivered"} once the buyer has it.`,
        buttons: (
          <Button onClick={() => act({ action: "delivered" }, "Completed")} disabled={!!busy}>
            {spin("delivered") ?? <CheckCircle2 className="size-4" />} {pickup ? "Picked up" : "Delivered"}
          </Button>
        ),
      };
  } else {
    if (status === "PAYMENT_PENDING")
      prompt = {
        text: `Pay ${formatINR(total)} to send this order to the seller.`,
        buttons: (
          <>
            <Button variant="ghost" onClick={() => act({ action: "cancel", as: "buyer" }, "Order cancelled")} disabled={!!busy}>
              Cancel
            </Button>
            <Button onClick={payNow} disabled={!!busy}>
              {spin("pay") ?? <CreditCard className="size-4" />} Pay now
            </Button>
          </>
        ),
      };
    else if (status === "PLACED")
      prompt = {
        text: "Waiting for the seller to accept. You can cancel until then.",
        buttons: (
          <Button variant="outline" onClick={() => setReasonFor({ action: "cancel", title: "Cancel this order?" })} disabled={!!busy}>
            Cancel order
          </Button>
        ),
      };
    else if (status === "DISPATCHED" || status === "READY_FOR_PICKUP")
      prompt = {
        text: pickup
          ? `Ready to collect${paymentMethod === "ON_DELIVERY" ? `. Pay the seller ${formatINR(total)} at pickup` : ""}. Confirm once you have it.`
          : `On the way${paymentMethod === "ON_DELIVERY" ? `. Pay the seller ${formatINR(total)} on delivery` : ""}. Confirm once you receive it.`,
        buttons: (
          <Button onClick={() => act({ action: "received" }, "Thanks! Order completed")} disabled={!!busy}>
            {spin("received") ?? <CheckCircle2 className="size-4" />} I received it
          </Button>
        ),
      };
  }

  return (
    <>
      {prompt && (
        <Card className="flex-col gap-3 border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm font-medium">{prompt.text}</p>
          <div className="flex flex-wrap justify-end gap-2">{prompt.buttons}</div>
        </Card>
      )}
      <Dialog open={!!reasonFor} onOpenChange={(o) => !o && !busy && setReasonFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reasonFor?.title}</DialogTitle>
            <DialogDescription>
              {side === "seller" ? "The buyer will see this reason." : "The seller will be told."}{" "}
              {paymentMethod === "ONLINE" ? "If paid online, the money is refunded automatically." : ""}
            </DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason, e.g. out of stock" rows={3} maxLength={300} />
          <Button
            variant="destructive"
            disabled={!!busy || (side === "seller" && reason.trim().length < 3)}
            onClick={() =>
              act(
                reasonFor?.action === "reject"
                  ? { action: "reject", reason: reason.trim() }
                  : { action: "cancel", as: side, ...(reason.trim().length >= 3 ? { reason: reason.trim() } : {}) },
                reasonFor?.action === "reject" ? "Order rejected" : "Order cancelled",
              )
            }
          >
            {busy && <Loader2 className="size-4 animate-spin" />} {reasonFor?.action === "reject" ? "Reject order" : "Cancel order"}
          </Button>
        </DialogContent>
      </Dialog>
      {dialog}
    </>
  );
}
