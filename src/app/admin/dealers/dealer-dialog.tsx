"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorMessage } from "@/lib/api-client";

export interface RegionOption {
  id: string;
  label: string;
  dealerId: string | null;
  dealerName: string | null;
}

interface DealerValue {
  id?: string;
  name: string;
  email: string;
  phone: string;
  sharePercent: string;
  regionIds: string[];
}

/** Create a dealer (no `initial`) or edit one. One dealer per region: regions held by someone else are disabled. */
export function DealerDialog({ regions, initial }: { regions: RegionOption[]; initial?: DealerValue }) {
  const router = useRouter();
  const editing = !!initial?.id;
  const blank: DealerValue = { name: "", email: "", phone: "", sharePercent: "20", regionIds: [] };
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<DealerValue>(initial ?? blank);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [temp, setTemp] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const share = Number(v.sharePercent);
    if (!Number.isFinite(share) || share < 0 || share > 100) {
      toast.error("Commission share must be between 0 and 100%");
      return;
    }
    setBusy(true);
    try {
      const commissionShareBps = Math.round(share * 100);
      if (editing) {
        await api(`/admin/dealers/${initial!.id}`, { method: "PATCH", body: { name: v.name, phone: v.phone, commissionShareBps, regionIds: v.regionIds } });
        toast.success("Dealer updated");
        setOpen(false);
      } else {
        const r = await api<{ temporaryPassword: string | null }>("/admin/dealers", {
          body: { name: v.name, email: v.email, phone: v.phone, password: password || null, commissionShareBps, regionIds: v.regionIds },
        });
        toast.success("Dealer created");
        if (r.temporaryPassword) setTemp(r.temporaryPassword);
        else setOpen(false);
      }
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {editing ? (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Pencil /> Edit
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <Plus /> New dealer
        </Button>
      )}
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setTemp(null);
            setPassword("");
            setV(initial ?? blank);
          }
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${initial!.name}` : "Create dealer"}</DialogTitle>
            <DialogDescription>Dealers onboard shops in their regions, approve those shops&apos; payout requests and earn a share of the platform commission.</DialogDescription>
          </DialogHeader>
          {temp ? (
            <div className="space-y-3">
              <p className="text-sm">Share this temporary password with the dealer securely. They log in at Staff login (or the Dukaan Partner app).</p>
              <div className="flex items-center gap-2 rounded-lg bg-muted p-3 font-mono">
                <span className="flex-1">{temp}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(temp);
                    toast.success("Copied");
                  }}
                  aria-label="Copy password"
                >
                  <Copy />
                </Button>
              </div>
              <Button className="w-full" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Name *</Label>
                  <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required minLength={2} />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Mobile *</Label>
                  <Input value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} required inputMode="numeric" />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Login email *</Label>
                  <Input type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} required disabled={editing} />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Share of platform commission (%) *</Label>
                  <Input value={v.sharePercent} onChange={(e) => setV({ ...v, sharePercent: e.target.value })} required inputMode="decimal" />
                </div>
                {!editing && (
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label className="text-xs">Password (blank = generate a temporary one)</Label>
                    <Input value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                  </div>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Regions</Label>
                {regions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No service areas yet. Add them in Settings → Service areas.</p>
                ) : (
                  <ul className="grid max-h-48 gap-1.5 overflow-y-auto rounded-lg border p-2 sm:grid-cols-2">
                    {regions.map((r) => {
                      const heldByOther = !!r.dealerId && r.dealerId !== initial?.id;
                      const checked = v.regionIds.includes(r.id);
                      return (
                        <li key={r.id}>
                          <label className={`flex items-start gap-2 text-sm ${heldByOther ? "opacity-60" : ""}`}>
                            <Checkbox
                              checked={checked}
                              disabled={heldByOther}
                              onCheckedChange={(on) => setV({ ...v, regionIds: on ? [...v.regionIds, r.id] : v.regionIds.filter((x) => x !== r.id) })}
                            />
                            <span>
                              {r.label}
                              {heldByOther && <span className="block text-xs text-muted-foreground">Dealer: {r.dealerName}</span>}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="animate-spin" />} {editing ? "Save changes" : "Create dealer"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
