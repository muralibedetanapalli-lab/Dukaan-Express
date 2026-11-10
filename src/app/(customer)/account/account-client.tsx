"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Home, LifeBuoy, Loader2, LogOut, MapPin, Package, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AddressForm, type AddressValue } from "@/components/customer/address-form";
import { ConfirmButton } from "@/components/shared/confirm-button";
import { Pill } from "@/components/shared/status-badge";
import { api, errorMessage } from "@/lib/api-client";
import { fmtDate } from "@/lib/format";

interface Addr extends AddressValue {
  id: string;
  isDefault: boolean;
}

export function AccountClient({
  user,
  addresses,
  tickets,
}: {
  user: { name: string | null; email: string | null; phone: string | null };
  addresses: Addr[];
  tickets: { id: string; ticketNumber: string; subject: string; status: string; resolution: string | null; orderNumber: string | null; createdAt: string }[];
}) {
  const router = useRouter();
  const [name, setName] = useState(user.name ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Partial<Addr> | null>(null);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/auth/me", { method: "PATCH", body: { name, email } });
      toast.success("Profile updated");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">My account</h1>
        <Button variant="outline" onClick={logout}>
          <LogOut /> Log out
        </Button>
      </div>

      <Card className="gap-4 p-5">
        <p className="flex items-center gap-2 font-semibold">
          <UserRound className="size-5 text-primary" /> Profile
        </p>
        <form onSubmit={saveProfile} className="grid gap-3 sm:grid-cols-3 sm:items-end">
          <div className="grid gap-1.5">
            <Label htmlFor="pname">Name</Label>
            <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} minLength={2} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pemail">Email</Label>
            <Input id="pemail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="animate-spin" />} Save
          </Button>
        </form>
        <p className="text-sm text-muted-foreground">Mobile: +91 {user.phone}</p>
      </Card>

      <Card className="gap-3 p-5">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 font-semibold">
            <MapPin className="size-5 text-primary" /> Saved addresses
          </p>
          <Button size="sm" variant="outline" onClick={() => setEditing({ name: user.name ?? "", phone: user.phone ?? "" })}>
            <Plus /> Add
          </Button>
        </div>
        {addresses.length === 0 && <p className="text-sm text-muted-foreground">No saved addresses yet.</p>}
        {addresses.map((a) => (
          <div key={a.id} className="flex items-start gap-3 rounded-xl border p-3">
            <Home className="mt-0.5 size-4 text-primary" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold">
                {a.label} {a.isDefault && <Pill tone="primary">Default</Pill>}
              </p>
              <p className="text-muted-foreground">
                {a.name}, {a.phone} · {a.line1}
                {a.line2 ? `, ${a.line2}` : ""}, {a.city} {a.pincode}
              </p>
              {!a.isDefault && (
                <button
                  className="mt-1 text-xs font-semibold text-primary"
                  onClick={async () => {
                    await api(`/customer/addresses/${a.id}`, { method: "PATCH", body: { isDefault: true } });
                    router.refresh();
                  }}
                >
                  Set as default
                </button>
              )}
            </div>
            <Button size="icon-sm" variant="ghost" onClick={() => setEditing(a)} aria-label="Edit address">
              <Pencil />
            </Button>
            <ConfirmButton
              size="icon-sm"
              variant="ghost"
              title="Delete this address?"
              destructive
              confirmLabel="Delete"
              onConfirm={async () => {
                await api(`/customer/addresses/${a.id}`, { method: "DELETE" });
                router.refresh();
              }}
            >
              <Trash2 />
            </ConfirmButton>
          </div>
        ))}
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/orders">
          <Card className="flex-row items-center gap-3 p-4 hover:shadow-md">
            <Package className="size-5 text-primary" /> <span className="font-semibold">Order history</span>
          </Card>
        </Link>
        <Card className="gap-2 p-4">
          <p className="flex items-center gap-2 font-semibold">
            <LifeBuoy className="size-5 text-primary" /> Support tickets
          </p>
          {tickets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tickets. Use &ldquo;Need help?&rdquo; on an order.</p>
          ) : (
            tickets.slice(0, 5).map((t) => (
              <div key={t.id} className="text-sm">
                <p className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{t.subject}</span>
                  <Pill tone={t.status === "RESOLVED" || t.status === "CLOSED" ? "success" : "warning"}>{t.status.replace("_", " ").toLowerCase()}</Pill>
                </p>
                <p className="text-xs text-muted-foreground">
                  {t.ticketNumber} · {fmtDate(t.createdAt)}
                  {t.orderNumber ? ` · ${t.orderNumber}` : ""}
                </p>
                {t.resolution && <p className="mt-0.5 text-xs">↳ {t.resolution}</p>}
              </div>
            ))
          )}
        </Card>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit address" : "Add address"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <AddressForm
              initial={editing}
              onCancel={() => setEditing(null)}
              onSaved={() => {
                setEditing(null);
                router.refresh();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
