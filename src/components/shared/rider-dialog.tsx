"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errorMessage } from "@/lib/api-client";

const VEHICLES = [
  { value: "BIKE", label: "Bike" },
  { value: "SCOOTER", label: "Scooter" },
  { value: "CYCLE", label: "Cycle" },
  { value: "OTHER", label: "Other" },
];

/** Onboard a rider. Dealers create riders for themselves; the admin picks the dealer. */
export function AddRiderButton({ endpoint, dealers }: { endpoint: "/dealer/riders" | "/admin/riders"; dealers?: { id: string; name: string }[] }) {
  const router = useRouter();
  const blank = { name: "", email: "", phone: "", password: "", vehicleType: "BIKE", vehicleNumber: "", dealerId: "" };
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [temp, setTemp] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ temporaryPassword: string | null }>(endpoint, {
        body: {
          name: v.name,
          email: v.email,
          phone: v.phone,
          password: v.password || null,
          vehicleType: v.vehicleType,
          vehicleNumber: v.vehicleNumber || null,
          ...(dealers ? { dealerId: v.dealerId || null } : {}),
        },
      });
      toast.success("Rider added");
      router.refresh();
      if (r.temporaryPassword) setTemp(r.temporaryPassword);
      else setOpen(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus /> Add rider
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setTemp(null);
            setV(blank);
          }
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add a rider</DialogTitle>
            <DialogDescription>The rider logs in to the Dukaan Rider app with this email and password.</DialogDescription>
          </DialogHeader>
          {temp ? (
            <div className="space-y-3">
              <p className="text-sm">Share this temporary password with the rider securely:</p>
              <div className="flex items-center gap-2 rounded-lg bg-muted p-3 font-mono">
                <span className="flex-1">{temp}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Copy password"
                  onClick={() => {
                    navigator.clipboard.writeText(temp);
                    toast.success("Copied");
                  }}
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
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label className="text-xs">Login email *</Label>
                  <Input type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} required autoComplete="off" />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Vehicle</Label>
                  <Select value={v.vehicleType} onValueChange={(x) => setV({ ...v, vehicleType: x })}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VEHICLES.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Vehicle number</Label>
                  <Input value={v.vehicleNumber} onChange={(e) => setV({ ...v, vehicleNumber: e.target.value.toUpperCase() })} placeholder="KA01AB1234" maxLength={20} />
                </div>
                {dealers && (
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label className="text-xs">Dealer (approves this rider&apos;s withdrawals)</Label>
                    <Select value={v.dealerId} onValueChange={(x) => setV({ ...v, dealerId: x })}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="No dealer — withdrawals come straight to admin" />
                      </SelectTrigger>
                      <SelectContent>
                        {dealers.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label className="text-xs">Password (blank = generate a temporary one)</Label>
                  <Input value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} autoComplete="new-password" />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="animate-spin" />} Add rider
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
