"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CreditCard, HelpCircle, Loader2, RotateCcw, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmButton } from "@/components/shared/confirm-button";
import { confirmPayment, usePayment } from "@/components/customer/payment";
import { useCart } from "@/components/customer/cart-context";
import { api, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export function OrderActions({
  orderId,
  status,
  cancellable,
  needsPayment,
  canReview,
  supportPhone,
}: {
  orderId: string;
  status: string;
  cancellable: boolean;
  needsPayment: boolean;
  canReview: boolean;
  supportPhone: string;
}) {
  const router = useRouter();
  const { refresh } = useCart();
  const { pay, dialog } = usePayment();
  const [paying, setPaying] = useState(false);
  const searchParams = useSearchParams();
  const returned = searchParams.get("payment") === "return";
  const confirmedReturn = useRef(false);

  // Back from Cashfree's hosted page (redirect flow): confirm the result with the server once.
  useEffect(() => {
    if (!returned || confirmedReturn.current) return;
    confirmedReturn.current = true;
    confirmPayment(orderId)
      .then((r) => {
        if (r === "paid") toast.success("Payment successful");
        else if (r === "failed") toast.error("Payment failed. You can try again.");
      })
      .catch((e) => toast.error(errorMessage(e)))
      .finally(() => router.replace(`/orders/${orderId}`));
  }, [returned, orderId, router]);
  const [reordering, setReordering] = useState(false);
  const [review, setReview] = useState(false);
  const [support, setSupport] = useState(false);

  async function retryPay() {
    setPaying(true);
    try {
      const r = await pay(orderId);
      if (r === "paid") toast.success("Payment successful");
      else if (r === "failed") toast.error("Payment failed");
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPaying(false);
    }
  }

  async function reorder() {
    setReordering(true);
    try {
      const r = await api<{ added: number; skipped: string[] }>(`/orders/${orderId}/reorder`, { method: "POST" });
      await refresh();
      if (r.skipped.length) toast.warning(`Some items are unavailable: ${r.skipped.join(", ")}`);
      if (r.added) router.push("/cart");
      else toast.error("None of these items are available right now");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setReordering(false);
    }
  }

  return (
    <>
      {dialog}
      {needsPayment && (
        <Card className="flex-row items-center justify-between gap-3 border-amber-300 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">Payment pending. Complete payment to send this order to the shop.</p>
          <Button onClick={retryPay} disabled={paying}>
            {paying ? <Loader2 className="animate-spin" /> : <CreditCard />} Pay now
          </Button>
        </Card>
      )}
      <div className="flex flex-wrap gap-2">
        {cancellable && (
          <ConfirmButton
            variant="outline"
            title="Cancel this order?"
            description="If you paid online, the amount will be refunded to your original payment method."
            confirmLabel="Cancel order"
            destructive
            requireReason
            reasonLabel="Why are you cancelling?"
            successMessage="Order cancelled"
            onConfirm={async (reason) => {
              await api(`/orders/${orderId}/cancel`, { body: { reason } });
              router.refresh();
            }}
          >
            Cancel order
          </ConfirmButton>
        )}
        {["DELIVERED", "CANCELLED", "SHOP_REJECTED", "REFUNDED"].includes(status) && (
          <Button variant="outline" onClick={reorder} disabled={reordering}>
            {reordering ? <Loader2 className="animate-spin" /> : <RotateCcw />} Reorder
          </Button>
        )}
        {canReview && (
          <Button variant="outline" onClick={() => setReview(true)}>
            <Star /> Rate order
          </Button>
        )}
        <Button variant="ghost" onClick={() => setSupport(true)}>
          <HelpCircle /> Need help?
        </Button>
      </div>
      <ReviewDialog open={review} onOpenChange={setReview} orderId={orderId} onDone={() => router.refresh()} />
      <SupportDialog open={support} onOpenChange={setSupport} orderId={orderId} supportPhone={supportPhone} />
    </>
  );
}

function ReviewDialog({ open, onOpenChange, orderId, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; orderId: string; onDone: () => void }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rate your order</DialogTitle>
        </DialogHeader>
        <div className="flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => setRating(n)} aria-label={`${n} stars`}>
              <Star className={cn("size-9", n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
            </button>
          ))}
        </div>
        <Textarea placeholder="Tell us about your experience (optional)" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} />
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api(`/orders/${orderId}/review`, { body: { rating, comment: comment || null } });
              toast.success("Thanks for your feedback!");
              onOpenChange(false);
              onDone();
            } catch (e) {
              toast.error(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Submit
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function SupportDialog({ open, onOpenChange, orderId, supportPhone }: { open: boolean; onOpenChange: (o: boolean) => void; orderId: string; supportPhone: string }) {
  const [category, setCategory] = useState("ORDER");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Contact support</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Call us at{" "}
          <a href={`tel:${supportPhone}`} className="font-semibold text-primary">
            {supportPhone}
          </a>{" "}
          or raise a ticket below.
        </p>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Topic</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["ORDER", "PAYMENT", "DELIVERY", "REFUND", "OTHER"].map((c) => (
                  <SelectItem key={c} value={c}>
                    {c.charAt(0) + c.slice(1).toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="subj">Subject</Label>
            <Input id="subj" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="msg">Message</Label>
            <Textarea id="msg" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} rows={4} />
          </div>
          <Button
            disabled={busy || subject.length < 3 || message.length < 5}
            onClick={async () => {
              setBusy(true);
              try {
                const t = await api<{ ticketNumber: string }>("/support/tickets", { body: { orderId, category, subject, message } });
                toast.success(`Ticket ${t.ticketNumber} created. We'll get back to you soon.`);
                onOpenChange(false);
                setSubject("");
                setMessage("");
              } catch (e) {
                toast.error(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Submit ticket
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
