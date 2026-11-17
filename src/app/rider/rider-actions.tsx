"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, PackageCheck, Undo2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmButton } from "@/components/shared/confirm-button";
import { api, errorMessage } from "@/lib/api-client";
import { formatINR } from "@/lib/money";

export function AcceptJobButton({ id, fee }: { id: string; fee: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      className="w-full"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await api(`/rider/jobs/${id}/accept`, { method: "POST" });
          toast.success("Delivery accepted — head to the shop");
          router.refresh();
        } catch (e) {
          toast.error(errorMessage(e));
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy && <Loader2 className="animate-spin" />} Accept · earn {formatINR(fee)}
    </Button>
  );
}

/** Steps on the rider's current delivery. */
export function ActiveDeliveryActions({ id, stage, cod }: { id: string; stage: "to_shop" | "to_customer"; cod: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");

  const send = async (body: Record<string, unknown>, ok: string) => {
    await api(`/rider/delivery/${id}`, { body });
    toast.success(ok);
    router.refresh();
  };

  if (stage === "to_shop") {
    return (
      <div className="grid gap-2">
        <ConfirmButton
          title="Picked up the order?"
          description="Confirm you have the sealed package from the shop. The customer is told you are on the way."
          confirmLabel="Yes, picked up"
          onConfirm={() => send({ action: "pickup" }, "On the way to the customer")}
          className="w-full"
          size="lg"
        >
          <PackageCheck /> Picked up from shop
        </ConfirmButton>
        <ConfirmButton
          title="Give this delivery back?"
          description="It is offered to other riders again. Only do this if you really can't do it."
          confirmLabel="Give back"
          destructive
          requireReason
          reasonLabel="Why? (shown to the shop and admin)"
          onConfirm={(reason) => send({ action: "release", reason }, "Delivery given back")}
          variant="ghost"
          size="sm"
        >
          <Undo2 /> Can&apos;t do this delivery
        </ConfirmButton>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <Button size="lg" className="w-full" onClick={() => setOpen(true)}>
        <CheckCircle2 /> Delivered{cod ? ` · collected ${formatINR(cod)}` : ""}
      </Button>
      <ConfirmButton
        title="Couldn't deliver?"
        description="The shop and admin are told. Keep the package safe and follow their instructions."
        confirmLabel="Report"
        destructive
        requireReason
        reasonLabel="What happened? (e.g. customer not reachable)"
        onConfirm={(reason) => send({ action: "failed", reason }, "Reported")}
        variant="ghost"
        size="sm"
      >
        <XCircle /> Couldn&apos;t deliver
      </ConfirmButton>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await send({ action: "complete", code }, "Delivered! Earning added to your wallet");
                setOpen(false);
                setCode("");
              } catch (err) {
                toast.error(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle>Customer&apos;s delivery code</DialogTitle>
              <DialogDescription>
                Ask the customer for the 4-digit code in their app.{cod ? ` Collect ${formatINR(cod)} in cash first.` : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="rcode">4-digit code</Label>
              <Input
                id="rcode"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                inputMode="numeric"
                autoComplete="one-time-code"
                className="h-14 text-center font-mono text-3xl tracking-[0.5em]"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="submit" size="lg" className="w-full" disabled={code.length !== 4 || busy}>
                {busy && <Loader2 className="animate-spin" />} Confirm delivery
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
