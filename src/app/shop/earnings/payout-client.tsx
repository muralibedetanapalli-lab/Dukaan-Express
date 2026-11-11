"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Landmark, Loader2, Pencil, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorMessage } from "@/lib/api-client";
import { formatINR } from "@/lib/money";

export interface BankViewDto {
  accountHolderName: string;
  accountNumberMasked: string;
  ifsc: string;
  bankName: string | null;
  upiId: string | null;
}

/** "Request payout" for the whole available balance, with a confirmation that shows where the money goes. */
export function RequestPayoutButton({ amount, orders, bank, disabledReason }: { amount: number; orders: number; bank: BankViewDto | null; disabledReason: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button size="lg" className="w-full sm:w-auto" disabled={!!disabledReason} onClick={() => setOpen(true)}>
        <Send /> Request payout
      </Button>
      {disabledReason && <p className="mt-1.5 text-xs text-muted-foreground">{disabledReason}</p>}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Request {formatINR(amount)}?</AlertDialogTitle>
            <AlertDialogDescription>
              Earnings from {orders} delivered {orders === 1 ? "order" : "orders"} after platform commission will be sent to{" "}
              <b>
                {bank?.accountHolderName} · {bank?.bankName ? `${bank.bankName} ` : ""}
                {bank?.accountNumberMasked} ({bank?.ifsc})
              </b>
              . The admin will transfer it and share the transaction details here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Not now</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await api("/shop/payouts", { method: "POST" });
                  toast.success("Payout requested. The admin has been notified.");
                  setOpen(false);
                  router.refresh();
                } catch (err) {
                  toast.error(errorMessage(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy && <Loader2 className="animate-spin" />} Request payout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function CancelPayoutButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await api(`/shop/payouts/${id}/cancel`, { method: "POST" });
          toast.success("Request cancelled");
          router.refresh();
        } catch (e) {
          toast.error(errorMessage(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : <X />} Cancel request
    </Button>
  );
}

const EMPTY = { accountHolderName: "", accountNumber: "", confirmAccountNumber: "", ifsc: "", bankName: "", upiId: "" };

export function BankAccountCard({ bank, locked }: { bank: BankViewDto | null; locked: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof EMPTY, val: string) => setV((p) => ({ ...p, [k]: val }));
  const mismatch = v.confirmAccountNumber.length > 0 && v.accountNumber !== v.confirmAccountNumber;

  function start() {
    setV({ ...EMPTY, accountHolderName: bank?.accountHolderName ?? "", ifsc: bank?.ifsc ?? "", bankName: bank?.bankName ?? "", upiId: bank?.upiId ?? "" });
    setOpen(true);
  }

  async function save() {
    setBusy(true);
    try {
      await api("/shop/bank-account", {
        method: "PATCH",
        body: { accountHolderName: v.accountHolderName, accountNumber: v.accountNumber, ifsc: v.ifsc, bankName: v.bankName || null, upiId: v.upiId || null },
      });
      toast.success("Bank account saved");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
            <Landmark className="size-5" />
          </div>
          <div>
            <p className="font-semibold">Payout bank account</p>
            <p className="text-xs text-muted-foreground">Payouts are sent here</p>
          </div>
        </div>
        <Button size="sm" variant={bank ? "outline" : "default"} onClick={start} disabled={locked} title={locked ? "Bank details can't change while a payout is in progress" : undefined}>
          <Pencil /> {bank ? "Change" : "Add bank account"}
        </Button>
      </div>
      {bank ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Account holder</dt>
            <dd className="font-medium">{bank.accountHolderName}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Account number</dt>
            <dd className="font-medium tabular-nums">{bank.accountNumberMasked}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">IFSC</dt>
            <dd className="font-medium">{bank.ifsc}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Bank</dt>
            <dd className="font-medium">{bank.bankName || "—"}</dd>
          </div>
          {bank.upiId && (
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">UPI ID</dt>
              <dd className="font-medium">{bank.upiId}</dd>
            </div>
          )}
        </dl>
      ) : (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">Add your bank account to request payouts.</p>
      )}
      {locked && bank && <p className="text-xs text-muted-foreground">Bank details are locked while a payout is in progress.</p>}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{bank ? "Change bank account" : "Add bank account"}</DialogTitle>
            <DialogDescription>Use an account in the shop owner&apos;s or business name. The account number is stored encrypted.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="b-name">Account holder name</Label>
              <Input id="b-name" value={v.accountHolderName} onChange={(e) => set("accountHolderName", e.target.value)} autoComplete="off" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="b-acc">Account number</Label>
              <Input id="b-acc" inputMode="numeric" value={v.accountNumber} onChange={(e) => set("accountNumber", e.target.value.replace(/\D/g, ""))} maxLength={18} autoComplete="off" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="b-acc2">Re-enter account number</Label>
              <Input
                id="b-acc2"
                inputMode="numeric"
                value={v.confirmAccountNumber}
                onChange={(e) => set("confirmAccountNumber", e.target.value.replace(/\D/g, ""))}
                onPaste={(e) => e.preventDefault()}
                maxLength={18}
                autoComplete="off"
                aria-invalid={mismatch}
              />
              {mismatch && <p className="text-xs text-destructive">Account numbers don&apos;t match</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="b-ifsc">IFSC</Label>
                <Input id="b-ifsc" value={v.ifsc} onChange={(e) => set("ifsc", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} maxLength={11} placeholder="HDFC0001234" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="b-bank">Bank name (optional)</Label>
                <Input id="b-bank" value={v.bankName} onChange={(e) => set("bankName", e.target.value)} maxLength={80} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="b-upi">UPI ID (optional)</Label>
              <Input id="b-upi" value={v.upiId} onChange={(e) => set("upiId", e.target.value.trim())} placeholder="name@okhdfcbank" maxLength={100} />
            </div>
            <Button
              disabled={busy || mismatch || v.accountHolderName.trim().length < 3 || v.accountNumber.length < 9 || v.accountNumber !== v.confirmAccountNumber || v.ifsc.length !== 11}
              onClick={save}
            >
              {busy && <Loader2 className="animate-spin" />} Save bank account
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
