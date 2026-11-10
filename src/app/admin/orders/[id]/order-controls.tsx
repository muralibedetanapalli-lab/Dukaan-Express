"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmButton } from "@/components/shared/confirm-button";
import { api, errorMessage } from "@/lib/api-client";
import { formatINR, toPaise } from "@/lib/money";
import { STATUS_META, type OrderStatusKey } from "@/lib/order-status";

export function AdminOrderControls({ orderId, allowed, refundable }: { orderId: string; allowed: string[]; refundable: number }) {
  const router = useRouter();
  const [to, setTo] = useState<string>("");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [amount, setAmount] = useState((refundable / 100).toFixed(2));
  const [reason, setReason] = useState("");
  const overrides = allowed.filter((s) => s !== "CANCELLED");

  return (
    <Card className="flex-col gap-3 p-4 lg:flex-row lg:items-end">
      {overrides.length > 0 && (
        <div className="flex flex-1 flex-wrap items-end gap-2">
          <div className="grid gap-1">
            <Label className="text-xs">Move order to</Label>
            <Select value={to} onValueChange={setTo}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {overrides.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_META[s as OrderStatusKey].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Remarks (required)" className="w-64 flex-1" />
          <Button
            disabled={!to || remarks.trim().length < 3 || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api(`/admin/orders/${orderId}/action`, { body: { action: "transition", to, remarks } });
                toast.success("Order updated");
                setTo("");
                setRemarks("");
                router.refresh();
              } catch (e) {
                toast.error(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="animate-spin" />} Apply override
          </Button>
        </div>
      )}
      <div className="flex gap-2">
        {allowed.includes("CANCELLED") && (
          <ConfirmButton
            variant="outline"
            destructive
            requireReason
            title="Cancel this order?"
            description="Stock is released, any shipment is cancelled, and prepaid amounts are refunded automatically (per refund settings)."
            confirmLabel="Cancel order"
            onConfirm={async (r) => {
              await api(`/admin/orders/${orderId}/action`, { body: { action: "cancel", reason: r } });
              router.refresh();
            }}
            successMessage="Order cancelled"
          >
            Cancel order
          </ConfirmButton>
        )}
        {refundable > 0 && (
          <Button variant="outline" onClick={() => setRefundOpen(true)}>
            Refund…
          </Button>
        )}
      </div>
      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue refund</DialogTitle>
            <DialogDescription>Refunds go back to the original payment method via Razorpay. Up to {formatINR(refundable)} can be refunded.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="ramt">Amount (₹)</Label>
              <Input id="ramt" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rreason">Reason</Label>
              <Textarea id="rreason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
            </div>
            <Button
              disabled={busy || reason.trim().length < 3}
              onClick={async () => {
                setBusy(true);
                try {
                  await api(`/admin/orders/${orderId}/action`, { body: { action: "refund", amount: toPaise(Number(amount)), reason } });
                  toast.success("Refund initiated");
                  setRefundOpen(false);
                  router.refresh();
                } catch (e) {
                  toast.error(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy && <Loader2 className="animate-spin" />} Refund {formatINR(toPaise(Number(amount) || 0))}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
