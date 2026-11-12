"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ImageUploader } from "@/components/shared/image-uploader";
import { formatINR } from "@/lib/money";
import { api, errorMessage } from "@/lib/api-client";

export function GenerateSettlement({ shopId, shopName, from, to }: { shopId: string; shopName: string; from: string; to: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(from.slice(0, 10));
  const [end, setEnd] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  void to;
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Create settlement
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Settle {shopName}</DialogTitle>
            <DialogDescription>Bundles all unsettled delivered orders in the period into one payout.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="s-from">From</Label>
              <Input id="s-from" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="s-to">To</Label>
              <Input id="s-to" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api("/admin/settlements", { body: { shopId, periodStart: `${start}T00:00:00`, periodEnd: `${end}T23:59:59` } });
                toast.success("Settlement created");
                setOpen(false);
                router.refresh();
              } catch (e) {
                toast.error(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="animate-spin" />} Create settlement
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

const METHODS = ["IMPS", "NEFT", "RTGS", "UPI", "OTHER"] as const;
const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

/** Click-to-copy value, for pasting bank details into net banking. */
export function CopyValue({ value, className }: { value: string; className?: string }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1 font-mono hover:text-primary ${className ?? ""}`}
      title="Copy"
      onClick={() => navigator.clipboard.writeText(value).then(() => toast.success("Copied"), () => toast.error("Couldn't copy"))}
    >
      {value} <Copy className="size-3 opacity-60" />
    </button>
  );
}

/** Record the transfer: UTR, method, date, optional receipt screenshot and note. The shop sees all of it. */
export function MarkPaid({ id, amount, shopName, base = "/admin/settlements" }: { id: string; amount?: number; shopName?: string; base?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ref, setRef] = useState("");
  const [method, setMethod] = useState<(typeof METHODS)[number]>("IMPS");
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [proof, setProof] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Mark paid
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record transfer{amount != null ? ` · ${formatINR(amount)}` : ""}</DialogTitle>
            <DialogDescription>{shopName ? `${shopName} will see these transaction details in their payout history.` : "The shop will see these transaction details."}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Method</Label>
                <Select value={method} onValueChange={(v) => setMethod(v as (typeof METHODS)[number])}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m === "OTHER" ? "Other" : m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="paid-on">Transfer date</Label>
                <Input id="paid-on" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="utr">UTR / transaction reference</Label>
              <Input id="utr" value={ref} onChange={(e) => setRef(e.target.value.trim())} placeholder="e.g. 431512345678" />
            </div>
            <div className="grid gap-1.5">
              <Label>Receipt screenshot (optional)</Label>
              <ImageUploader value={proof} onChange={(u) => setProof(u.slice(-1))} folder="payouts" max={1} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pay-notes">Note to shop (optional)</Label>
              <Textarea id="pay-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} rows={2} />
            </div>
            <Button
              disabled={busy || ref.length < 3}
              onClick={async () => {
                setBusy(true);
                try {
                  const paidAt = date === today() ? new Date().toISOString() : new Date(`${date}T12:00:00`).toISOString();
                  await api(`${base}/${id}`, { body: { reference: ref, payoutMethod: method, paidAt, notes: notes.trim() || null, proofUrl: proof[0] ?? null } });
                  toast.success("Payout recorded. The shop has been notified.");
                  setOpen(false);
                  router.refresh();
                } catch (e) {
                  toast.error(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy && <Loader2 className="animate-spin" />} Confirm transfer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RejectPayout({ id, base = "/admin/settlements" }: { id: string; base?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Decline
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline payout request</DialogTitle>
            <DialogDescription>The orders go back to the shop&apos;s available balance. The shop sees this reason.</DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Bank account name doesn't match the shop owner" maxLength={300} rows={3} />
          <Button
            variant="destructive"
            disabled={busy || reason.trim().length < 3}
            onClick={async () => {
              setBusy(true);
              try {
                await api(`${base}/${id}/reject`, { body: { reason: reason.trim() } });
                toast.success("Request declined");
                setOpen(false);
                router.refresh();
              } catch (e) {
                toast.error(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="animate-spin" />} Decline request
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
