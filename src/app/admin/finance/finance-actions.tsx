"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export function MarkPaid({ id }: { id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Mark paid
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record payout</DialogTitle>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="utr">Bank reference / UTR</Label>
            <Input id="utr" value={ref} onChange={(e) => setRef(e.target.value)} />
          </div>
          <Button
            disabled={busy || ref.trim().length < 3}
            onClick={async () => {
              setBusy(true);
              try {
                await api(`/admin/settlements/${id}`, { body: { reference: ref } });
                toast.success("Marked as paid");
                setOpen(false);
                router.refresh();
              } catch (e) {
                toast.error(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="animate-spin" />} Confirm payout
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
