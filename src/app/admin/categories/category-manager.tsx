"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ImageUploader } from "@/components/shared/image-uploader";
import { ConfirmButton } from "@/components/shared/confirm-button";
import { Pill } from "@/components/shared/status-badge";
import { api, errorMessage } from "@/lib/api-client";
import { bpsToPercent } from "@/lib/money";

interface Sub {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  imageUrl: string | null;
}
interface Cat {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  taxRateBps: number | null;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
  subcategories: Sub[];
}

type Editing = { kind: "cat"; value: Partial<Cat> } | { kind: "sub"; categoryId: string; value: Partial<Sub> } | null;

export function CategoryManager({ categories }: { categories: Cat[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Editing>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!editing) return;
    setBusy(true);
    try {
      if (editing.kind === "cat") {
        const v = editing.value;
        const body = {
          name: v.name,
          description: v.description || null,
          imageUrl: v.imageUrl ?? null,
          taxRateBps: v.taxRateBps ?? null,
          sortOrder: v.sortOrder ?? 0,
          isActive: v.isActive ?? true,
        };
        if (v.id) await api(`/admin/categories/${v.id}`, { method: "PATCH", body });
        else await api("/admin/categories", { body });
      } else {
        const v = editing.value;
        const body = { categoryId: editing.categoryId, name: v.name, imageUrl: v.imageUrl ?? null, sortOrder: v.sortOrder ?? 0, isActive: v.isActive ?? true };
        if (v.id) await api(`/admin/subcategories/${v.id}`, { method: "PATCH", body });
        else await api("/admin/subcategories", { body });
      }
      toast.success("Saved");
      setEditing(null);
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function quickToggle(c: Cat) {
    try {
      await api(`/admin/categories/${c.id}`, {
        method: "PATCH",
        body: { name: c.name, description: c.description, imageUrl: c.imageUrl, taxRateBps: c.taxRateBps, sortOrder: c.sortOrder, isActive: !c.isActive },
      });
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setEditing({ kind: "cat", value: { isActive: true, sortOrder: categories.length } })}>
          <Plus /> New category
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {categories.map((c) => (
          <Card key={c.id} className="gap-3 p-4">
            <div className="flex items-start gap-3">
              <div className="size-14 shrink-0 overflow-hidden rounded-xl bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {c.imageUrl && <img src={c.imageUrl} alt="" className="size-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  {c.productCount} products · GST {c.taxRateBps == null ? "default" : bpsToPercent(c.taxRateBps)}
                </p>
              </div>
              <Switch checked={c.isActive} onCheckedChange={() => quickToggle(c)} aria-label="Active" />
              <Button size="icon-sm" variant="ghost" onClick={() => setEditing({ kind: "cat", value: c })} aria-label="Edit category">
                <Pencil />
              </Button>
              {c.productCount === 0 && (
                <ConfirmButton
                  size="icon-sm"
                  variant="ghost"
                  destructive
                  title={`Delete ${c.name}?`}
                  confirmLabel="Delete"
                  onConfirm={async () => {
                    await api(`/admin/categories/${c.id}`, { method: "DELETE" });
                    router.refresh();
                  }}
                >
                  <Trash2 />
                </ConfirmButton>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {c.subcategories.map((s) => (
                <button key={s.id} onClick={() => setEditing({ kind: "sub", categoryId: c.id, value: s })} className="rounded-full border px-2.5 py-0.5 text-xs hover:border-primary">
                  {s.name} {!s.isActive && <Pill tone="neutral">off</Pill>}
                </button>
              ))}
              <button onClick={() => setEditing({ kind: "sub", categoryId: c.id, value: { isActive: true, sortOrder: c.subcategories.length } })} className="rounded-full border border-dashed px-2.5 py-0.5 text-xs text-primary">
                + Subcategory
              </button>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing?.value.id ? "Edit" : "New"} {editing?.kind === "sub" ? "subcategory" : "category"}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="c-name">Name</Label>
                <Input id="c-name" value={editing.value.name ?? ""} onChange={(e) => setEditing({ ...editing, value: { ...editing.value, name: e.target.value } } as Editing)} />
              </div>
              {editing.kind === "cat" && (
                <>
                  <div className="grid gap-1.5">
                    <Label htmlFor="c-desc">Description</Label>
                    <Input id="c-desc" value={editing.value.description ?? ""} onChange={(e) => setEditing({ ...editing, value: { ...editing.value, description: e.target.value } })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="c-gst">GST % (blank = platform default)</Label>
                    <Input
                      id="c-gst"
                      inputMode="decimal"
                      value={editing.value.taxRateBps == null ? "" : String(editing.value.taxRateBps / 100)}
                      onChange={(e) => setEditing({ ...editing, value: { ...editing.value, taxRateBps: e.target.value === "" ? null : Math.round(Number(e.target.value) * 100) } })}
                    />
                  </div>
                </>
              )}
              <div className="grid gap-1.5">
                <Label>Image</Label>
                <ImageUploader
                  value={editing.value.imageUrl ? [editing.value.imageUrl] : []}
                  onChange={(u) => setEditing({ ...editing, value: { ...editing.value, imageUrl: u[0] ?? null } } as Editing)}
                  folder="categories"
                  max={1}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="c-sort">Sort order</Label>
                  <Input id="c-sort" inputMode="numeric" value={editing.value.sortOrder ?? 0} onChange={(e) => setEditing({ ...editing, value: { ...editing.value, sortOrder: Number(e.target.value) || 0 } } as Editing)} />
                </div>
                <label className="flex items-center gap-2 pt-6 text-sm">
                  <Switch checked={editing.value.isActive ?? true} onCheckedChange={(x) => setEditing({ ...editing, value: { ...editing.value, isActive: x } } as Editing)} /> Active
                </label>
              </div>
              <Button onClick={save} disabled={busy || !(editing.value.name ?? "").trim()}>
                {busy && <Loader2 className="animate-spin" />} Save
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
