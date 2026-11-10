"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorMessage } from "@/lib/api-client";

export function CreateOwnerButton({ shops }: { shops: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: "", email: "", phone: "", password: "" });
  const [shopIds, setShopIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [temp, setTemp] = useState<string | null>(null);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus /> New owner
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setTemp(null);
            setV({ name: "", email: "", phone: "", password: "" });
            setShopIds([]);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create shop owner</DialogTitle>
            <DialogDescription>Leave password blank to generate a temporary one.</DialogDescription>
          </DialogHeader>
          {temp ? (
            <div className="space-y-3">
              <p className="text-sm">Account created. Share this temporary password securely — it won&apos;t be shown again.</p>
              <div className="flex items-center gap-2 rounded-xl border bg-muted p-3 font-mono">
                <span className="flex-1">{temp}</span>
                <Button size="icon-sm" variant="ghost" onClick={() => navigator.clipboard.writeText(temp).then(() => toast.success("Copied"))} aria-label="Copy password">
                  <Copy />
                </Button>
              </div>
              <Button className="w-full" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          ) : (
            <form
              className="grid gap-3"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  const r = await api<{ temporaryPassword: string | null }>("/admin/owners", { body: { ...v, password: v.password || null, shopIds } });
                  toast.success("Owner created");
                  router.refresh();
                  if (r.temporaryPassword) setTemp(r.temporaryPassword);
                  else setOpen(false);
                } catch (err) {
                  toast.error(errorMessage(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div className="grid gap-1.5">
                <Label htmlFor="o-name">Full name</Label>
                <Input id="o-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required minLength={2} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="o-email">Email (login)</Label>
                  <Input id="o-email" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} required />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="o-phone">Mobile</Label>
                  <Input id="o-phone" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} required inputMode="numeric" />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="o-pw">Password (optional)</Label>
                <Input id="o-pw" type="password" autoComplete="new-password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} placeholder="Min 8 chars, letters & numbers" />
              </div>
              {shops.length > 0 && (
                <div className="grid gap-1.5">
                  <Label>Assign unassigned shops</Label>
                  {shops.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={shopIds.includes(s.id)} onCheckedChange={(c) => setShopIds((x) => (c ? [...x, s.id] : x.filter((i) => i !== s.id)))} /> {s.name}
                    </label>
                  ))}
                </div>
              )}
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="animate-spin" />} Create owner
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
