"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChefHat, Loader2, PackageCheck, PackageOpen, PencilLine } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmButton } from "@/components/shared/confirm-button";
import { api, errorMessage } from "@/lib/api-client";

const ACTION: Record<string, { action: string; icon: typeof CheckCircle2; confirm?: string }> = {
  SHOP_ACCEPTED: { action: "accept", icon: CheckCircle2 },
  PREPARING: { action: "start_preparing", icon: ChefHat },
  READY_FOR_PACKING: { action: "ready_for_packing", icon: PackageOpen },
  PACKED: { action: "packed", icon: PackageCheck, confirm: "Confirm all items are packed. A Shiprocket shipment will be created and a courier requested." },
};

export function ShopOrderActions({
  orderId,
  forward,
  canReject,
  canModify,
  items,
}: {
  orderId: string;
  forward: { to: string; label: string } | null;
  canReject: boolean;
  canModify: boolean;
  items: { id: string; name: string; quantity: number }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [modOpen, setModOpen] = useState(false);

  async function run(action: string) {
    setBusy(true);
    try {
      const r = await api<{ status: string; shipment?: { ok: boolean; error: string | null } }>(`/shop/orders/${orderId}/action`, { body: { action } });
      if (r.shipment) {
        if (r.shipment.ok) toast.success("Packed! Shipment created — awaiting courier pickup.");
        else toast.warning(`Packed, but shipment could not be created: ${r.shipment.error}`);
      } else toast.success("Order updated");
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!forward && !canReject && !canModify) return null;
  const a = forward ? ACTION[forward.to] : null;

  return (
    <Card className="flex-col gap-2 p-3 sm:flex-row sm:items-center">
      {forward && a && (
        a.confirm ? (
          <ConfirmButton title={forward.label} description={a.confirm} confirmLabel={forward.label} onConfirm={() => run(a.action)} size="lg" className="h-12 text-base sm:flex-1" disabled={busy}>
            <a.icon /> {forward.label}
          </ConfirmButton>
        ) : (
          <Button size="lg" className="h-12 text-base sm:flex-1" onClick={() => run(a.action)} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <a.icon />} {forward.label}
          </Button>
        )
      )}
      {canReject && (
        <ConfirmButton
          variant="outline"
          size="lg"
          className="h-12"
          title="Reject this order?"
          description="The customer will be notified and refunded automatically if they paid online."
          destructive
          requireReason
          reasonLabel="Reason for rejecting"
          confirmLabel="Reject Order"
          onConfirm={async (reason) => {
            await api(`/shop/orders/${orderId}/action`, { body: { action: "reject", reason } });
            toast.success("Order rejected");
            router.refresh();
          }}
        >
          Reject Order
        </ConfirmButton>
      )}
      {canModify && (
        <Button variant="ghost" size="lg" className="h-12" onClick={() => setModOpen(true)}>
          <PencilLine /> Request change
        </Button>
      )}
      <ModificationDialog open={modOpen} onOpenChange={setModOpen} orderId={orderId} items={items} onDone={() => router.refresh()} />
    </Card>
  );
}

function ModificationDialog({
  open,
  onOpenChange,
  orderId,
  items,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orderId: string;
  items: { id: string; name: string; quantity: number }[];
  onDone: () => void;
}) {
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(items.map((i) => [i.id, i.quantity])));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const changes = items.filter((i) => qty[i.id] !== i.quantity).map((i) => ({ orderItemId: i.id, newQuantity: qty[i.id] }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request order change</DialogTitle>
          <DialogDescription>You can only reduce quantities (e.g. item out of stock). An admin must approve, and the customer is refunded the difference.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate">{i.name}</span>
              <Input
                type="number"
                min={0}
                max={i.quantity}
                value={qty[i.id]}
                onChange={(e) => setQty((q) => ({ ...q, [i.id]: Math.max(0, Math.min(i.quantity, Number(e.target.value) || 0)) }))}
                className="w-20"
                aria-label={`New quantity for ${i.name}`}
              />
            </li>
          ))}
        </ul>
        <div className="grid gap-1.5">
          <Label htmlFor="mod-reason">Reason</Label>
          <Textarea id="mod-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Paneer out of stock" maxLength={300} />
        </div>
        <Button
          disabled={busy || !changes.length || reason.trim().length < 5}
          onClick={async () => {
            setBusy(true);
            try {
              await api(`/shop/orders/${orderId}/modification`, { body: { reason, changes } });
              toast.success("Change requested — waiting for admin approval");
              onOpenChange(false);
              onDone();
            } catch (e) {
              toast.error(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy && <Loader2 className="animate-spin" />} Submit request
        </Button>
      </DialogContent>
    </Dialog>
  );
}
