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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImageUploader } from "@/components/shared/image-uploader";
import { ConfirmButton } from "@/components/shared/confirm-button";
import { Pill } from "@/components/shared/status-badge";
import { api, errorMessage } from "@/lib/api-client";
import { bpsToPercent, formatINR, toPaise, toRupees } from "@/lib/money";
import { fmtDate } from "@/lib/format";

interface Coupon {
  id: string;
  code: string;
  description: string | null;
  type: "FLAT" | "PERCENT";
  value: number;
  maxDiscount: number | null;
  minOrderAmount: number;
  usageLimit: number | null;
  perUserLimit: number;
  usedCount: number;
  firstOrderOnly: boolean;
  shopId: string | null;
  shopName: string | null;
  validFrom: string;
  validTo: string | null;
  isActive: boolean;
}
interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  bgColor: string;
  sortOrder: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
}

export function MarketingClient({ coupons, banners, shops }: { coupons: Coupon[]; banners: Banner[]; shops: { id: string; name: string }[] }) {
  return (
    <Tabs defaultValue="coupons">
      <TabsList>
        <TabsTrigger value="coupons">Coupons ({coupons.length})</TabsTrigger>
        <TabsTrigger value="banners">Banners ({banners.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="coupons" className="mt-4">
        <Coupons coupons={coupons} shops={shops} />
      </TabsContent>
      <TabsContent value="banners" className="mt-4">
        <Banners banners={banners} />
      </TabsContent>
    </Tabs>
  );
}

function Coupons({ coupons, shops }: { coupons: Coupon[]; shops: { id: string; name: string }[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Record<string, string | boolean> | null>(null);
  const [busy, setBusy] = useState(false);
  const open = (c?: Coupon) =>
    setEdit(
      c
        ? {
            id: c.id,
            code: c.code,
            description: c.description ?? "",
            type: c.type,
            value: c.type === "FLAT" ? String(toRupees(c.value)) : String(c.value / 100),
            maxDiscount: c.maxDiscount ? String(toRupees(c.maxDiscount)) : "",
            minOrderAmount: String(toRupees(c.minOrderAmount)),
            usageLimit: c.usageLimit ? String(c.usageLimit) : "",
            perUserLimit: String(c.perUserLimit),
            firstOrderOnly: c.firstOrderOnly,
            shopId: c.shopId ?? "__all",
            validTo: c.validTo?.slice(0, 10) ?? "",
            isActive: c.isActive,
          }
        : { code: "", description: "", type: "FLAT", value: "", maxDiscount: "", minOrderAmount: "0", usageLimit: "", perUserLimit: "1", firstOrderOnly: false, shopId: "__all", validTo: "", isActive: true },
    );

  async function save() {
    if (!edit) return;
    setBusy(true);
    try {
      const body = {
        code: edit.code,
        description: edit.description || null,
        type: edit.type,
        value: edit.type === "FLAT" ? toPaise(Number(edit.value)) : Math.round(Number(edit.value) * 100),
        maxDiscount: edit.maxDiscount ? toPaise(Number(edit.maxDiscount)) : null,
        minOrderAmount: toPaise(Number(edit.minOrderAmount) || 0),
        usageLimit: edit.usageLimit ? Number(edit.usageLimit) : null,
        perUserLimit: Number(edit.perUserLimit) || 1,
        firstOrderOnly: edit.firstOrderOnly,
        shopId: edit.shopId === "__all" ? null : edit.shopId,
        validTo: edit.validTo ? `${edit.validTo}T23:59:59` : null,
        isActive: edit.isActive,
      };
      if (edit.id) await api(`/admin/coupons/${edit.id}`, { method: "PATCH", body });
      else await api("/admin/coupons", { body });
      toast.success("Coupon saved");
      setEdit(null);
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const s = (k: string, v: string | boolean) => setEdit((e) => ({ ...e!, [k]: v }));

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button onClick={() => open()}>
          <Plus /> New coupon
        </Button>
      </div>
      <Card className="gap-0 overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Offer</TableHead>
              <TableHead>Rules</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead className="text-right">Used</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {coupons.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono font-bold">{c.code}</TableCell>
                <TableCell>
                  {c.type === "FLAT" ? formatINR(c.value) : bpsToPercent(c.value)} off
                  {c.maxDiscount ? <span className="text-xs text-muted-foreground"> (max {formatINR(c.maxDiscount)})</span> : null}
                  <p className="text-xs text-muted-foreground">{c.description}</p>
                </TableCell>
                <TableCell className="text-xs">
                  Min {formatINR(c.minOrderAmount)} · {c.perUserLimit}/user{c.firstOrderOnly ? " · first order" : ""}
                  {c.validTo ? ` · until ${fmtDate(c.validTo)}` : ""}
                </TableCell>
                <TableCell className="text-xs">{c.shopName ?? "All shops"}</TableCell>
                <TableCell className="text-right">
                  {c.usedCount}
                  {c.usageLimit ? ` / ${c.usageLimit}` : ""}
                </TableCell>
                <TableCell>
                  <Pill tone={c.isActive ? "success" : "neutral"}>{c.isActive ? "active" : "inactive"}</Pill>
                </TableCell>
                <TableCell>
                  <Button size="icon-sm" variant="ghost" onClick={() => open(c)} aria-label="Edit coupon">
                    <Pencil />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Edit coupon" : "New coupon"}</DialogTitle>
          </DialogHeader>
          {edit && (
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <F label="Code">
                  <Input value={edit.code as string} onChange={(e) => s("code", e.target.value.toUpperCase())} className="font-mono" disabled={!!edit.id} />
                </F>
                <F label="Type">
                  <Select value={edit.type as string} onValueChange={(v) => s("type", v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FLAT">Flat ₹ off</SelectItem>
                      <SelectItem value="PERCENT">% off</SelectItem>
                    </SelectContent>
                  </Select>
                </F>
              </div>
              <F label="Description">
                <Input value={edit.description as string} onChange={(e) => s("description", e.target.value)} />
              </F>
              <div className="grid grid-cols-3 gap-3">
                <F label={edit.type === "FLAT" ? "Discount (₹)" : "Discount (%)"}>
                  <Input value={edit.value as string} onChange={(e) => s("value", e.target.value)} inputMode="decimal" />
                </F>
                <F label="Max discount (₹)">
                  <Input value={edit.maxDiscount as string} onChange={(e) => s("maxDiscount", e.target.value)} inputMode="decimal" />
                </F>
                <F label="Min order (₹)">
                  <Input value={edit.minOrderAmount as string} onChange={(e) => s("minOrderAmount", e.target.value)} inputMode="decimal" />
                </F>
                <F label="Total uses">
                  <Input value={edit.usageLimit as string} onChange={(e) => s("usageLimit", e.target.value)} inputMode="numeric" placeholder="∞" />
                </F>
                <F label="Per customer">
                  <Input value={edit.perUserLimit as string} onChange={(e) => s("perUserLimit", e.target.value)} inputMode="numeric" />
                </F>
                <F label="Valid until">
                  <Input type="date" value={edit.validTo as string} onChange={(e) => s("validTo", e.target.value)} />
                </F>
              </div>
              <F label="Shop">
                <Select value={edit.shopId as string} onValueChange={(v) => s("shopId", v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">All shops</SelectItem>
                    {shops.map((sh) => (
                      <SelectItem key={sh.id} value={sh.id}>
                        {sh.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </F>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={edit.firstOrderOnly as boolean} onCheckedChange={(v) => s("firstOrderOnly", v)} /> First order only
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={edit.isActive as boolean} onCheckedChange={(v) => s("isActive", v)} /> Active
              </label>
              <Button onClick={save} disabled={busy}>
                {busy && <Loader2 className="animate-spin" />} Save coupon
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Banners({ banners }: { banners: Banner[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Partial<Banner> | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!edit) return;
    setBusy(true);
    try {
      const body = { title: edit.title, subtitle: edit.subtitle || null, imageUrl: edit.imageUrl ?? null, linkUrl: edit.linkUrl || null, bgColor: edit.bgColor ?? "#15803d", sortOrder: edit.sortOrder ?? 0, isActive: edit.isActive ?? true };
      if (edit.id) await api(`/admin/banners/${edit.id}`, { method: "PATCH", body });
      else await api("/admin/banners", { body });
      toast.success("Banner saved");
      setEdit(null);
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button onClick={() => setEdit({ isActive: true, bgColor: "#15803d", sortOrder: banners.length })}>
          <Plus /> New banner
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {banners.map((b) => (
          <Card key={b.id} className="gap-0 overflow-hidden p-0">
            <div className="relative h-28 p-4 text-white" style={{ background: b.bgColor }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {b.imageUrl && <img src={b.imageUrl} alt="" className="absolute inset-0 size-full object-cover opacity-30" />}
              <p className="relative text-lg font-bold">{b.title}</p>
              <p className="relative text-sm text-white/85">{b.subtitle}</p>
            </div>
            <div className="flex items-center justify-between p-3 text-xs">
              <span className="truncate text-muted-foreground">{b.linkUrl ?? "no link"}</span>
              <span className="flex items-center gap-1">
                <Pill tone={b.isActive ? "success" : "neutral"}>{b.isActive ? "live" : "hidden"}</Pill>
                <Button size="icon-sm" variant="ghost" onClick={() => setEdit(b)} aria-label="Edit banner">
                  <Pencil />
                </Button>
                <ConfirmButton
                  size="icon-sm"
                  variant="ghost"
                  destructive
                  title="Delete banner?"
                  confirmLabel="Delete"
                  onConfirm={async () => {
                    await api(`/admin/banners/${b.id}`, { method: "DELETE" });
                    router.refresh();
                  }}
                >
                  <Trash2 />
                </ConfirmButton>
              </span>
            </div>
          </Card>
        ))}
      </div>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Edit banner" : "New banner"}</DialogTitle>
          </DialogHeader>
          {edit && (
            <div className="grid gap-3">
              <F label="Title">
                <Input value={edit.title ?? ""} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
              </F>
              <F label="Subtitle">
                <Input value={edit.subtitle ?? ""} onChange={(e) => setEdit({ ...edit, subtitle: e.target.value })} />
              </F>
              <div className="grid grid-cols-3 gap-3">
                <F label="Link (internal path)">
                  <Input value={edit.linkUrl ?? ""} onChange={(e) => setEdit({ ...edit, linkUrl: e.target.value })} placeholder="/search?category=bakery" />
                </F>
                <F label="Colour">
                  <Input type="color" value={edit.bgColor ?? "#15803d"} onChange={(e) => setEdit({ ...edit, bgColor: e.target.value })} />
                </F>
                <F label="Order">
                  <Input value={edit.sortOrder ?? 0} onChange={(e) => setEdit({ ...edit, sortOrder: Number(e.target.value) || 0 })} inputMode="numeric" />
                </F>
              </div>
              <F label="Background image (optional)">
                <ImageUploader value={edit.imageUrl ? [edit.imageUrl] : []} onChange={(u) => setEdit({ ...edit, imageUrl: u[0] ?? null })} folder="banners" max={1} />
              </F>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={edit.isActive ?? true} onCheckedChange={(v) => setEdit({ ...edit, isActive: v })} /> Live
              </label>
              <Button onClick={save} disabled={busy || !edit.title}>
                {busy && <Loader2 className="animate-spin" />} Save banner
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
