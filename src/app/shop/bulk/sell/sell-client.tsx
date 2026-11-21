"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Package, Percent, Search, Tags } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { api, errorMessage } from "@/lib/api-client";
import { bpsToPercent, formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";

type Settings = { sellsBulk: boolean; bulkMinOrder: number; bulkDelivers: boolean; bulkDeliveryFee: number; bulkPickup: boolean; bulkPayOnDelivery: boolean };
type Item = {
  id: string;
  name: string;
  variant: string;
  image: string | null;
  mrp: number;
  sellingPrice: number;
  stock: number;
  bulkPrice: number | null;
  bulkMinQty: number;
};
type Row = { on: boolean; price: string; minQty: string };

const rupees = (paise: number) => String(Math.round(paise) / 100);
const paise = (r: string) => Math.round(Number(r) * 100);

export function SellBulkClient({ settings, items, commissionBps }: { settings: Settings; items: Item[]; commissionBps: number }) {
  const router = useRouter();
  const [s, setS] = useState({ ...settings, minOrder: rupees(settings.bulkMinOrder), fee: rupees(settings.bulkDeliveryFee) });
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      items.map((i) => [i.id, { on: i.bulkPrice != null, price: i.bulkPrice != null ? rupees(i.bulkPrice) : "", minQty: String(i.bulkMinQty) }]),
    ),
  );
  const [q, setQ] = useState("");
  const [pct, setPct] = useState("10");
  const [busy, setBusy] = useState<"settings" | "prices" | null>(null);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? items.filter((i) => i.name.toLowerCase().includes(t)) : items;
  }, [items, q]);
  const changed = items.filter((i) => {
    const r = rows[i.id];
    const price = r.on && r.price ? paise(r.price) : null;
    return price !== i.bulkPrice || Number(r.minQty) !== i.bulkMinQty;
  });
  const listed = items.filter((i) => rows[i.id].on && rows[i.id].price).length;

  const setRow = (id: string, patch: Partial<Row>) => setRows((p) => ({ ...p, [id]: { ...p[id], ...patch } }));

  function applyDiscount() {
    const d = Math.min(90, Math.max(0, Number(pct) || 0));
    setRows((p) => {
      const next = { ...p };
      for (const i of shown)
        next[i.id] = { ...next[i.id], on: true, price: rupees(Math.round((i.sellingPrice * (100 - d)) / 100)), minQty: next[i.id].minQty || "1" };
      return next;
    });
    toast.message(`Prices set ${d}% below your retail price for ${shown.length} product${shown.length === 1 ? "" : "s"}. Review and save.`);
  }

  async function saveSettings() {
    setBusy("settings");
    try {
      await api("/shop/bulk/settings", {
        method: "PATCH",
        body: {
          sellsBulk: s.sellsBulk,
          bulkMinOrder: paise(s.minOrder || "0"),
          bulkDelivers: s.bulkDelivers,
          bulkDeliveryFee: paise(s.fee || "0"),
          bulkPickup: s.bulkPickup,
          bulkPayOnDelivery: s.bulkPayOnDelivery,
        },
      });
      toast.success(s.sellsBulk ? "Wholesale settings saved" : "Bulk selling switched off");
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function savePrices() {
    for (const i of changed) {
      const r = rows[i.id];
      if (r.on && (!r.price || paise(r.price) < 100)) return toast.error(`Enter a bulk price for ${i.name}`);
      if (r.on && paise(r.price) > i.mrp) return toast.error(`${i.name}: bulk price can't be above MRP (${formatINR(i.mrp)})`);
      if (!(Number(r.minQty) >= 1)) return toast.error(`${i.name}: minimum quantity must be at least 1`);
    }
    setBusy("prices");
    try {
      await api("/shop/bulk/prices", {
        body: {
          items: changed.map((i) => ({
            inventoryId: i.id,
            bulkPrice: rows[i.id].on && rows[i.id].price ? paise(rows[i.id].price) : null,
            bulkMinQty: Math.floor(Number(rows[i.id].minQty)),
          })),
        },
      });
      toast.success(`Saved ${changed.length} product${changed.length === 1 ? "" : "s"}`);
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4 pb-20">
      <Card className="gap-4 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 font-semibold">
              <Tags className="size-4 text-primary" /> Sell in bulk to other shops
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Shops near you can order your bulk-priced products. A {bpsToPercent(commissionBps)} platform commission applies to completed bulk orders.
            </p>
          </div>
          <Switch checked={s.sellsBulk} onCheckedChange={(v) => setS({ ...s, sellsBulk: v })} aria-label="Sell in bulk" />
        </div>
        {s.sellsBulk && (
          <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="minOrder">Minimum order value (₹)</Label>
              <Input
                id="minOrder"
                value={s.minOrder}
                onChange={(e) => setS({ ...s, minOrder: e.target.value.replace(/[^\d.]/g, "") })}
                inputMode="decimal"
                placeholder="0 = no minimum"
              />
            </div>
            <div className="space-y-3">
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>I deliver bulk orders</span>
                <Switch checked={s.bulkDelivers} onCheckedChange={(v) => setS({ ...s, bulkDelivers: v })} />
              </label>
              {s.bulkDelivers && (
                <div className="flex items-center gap-2">
                  <Label htmlFor="fee" className="shrink-0 text-xs text-muted-foreground">
                    Delivery charge (₹)
                  </Label>
                  <Input
                    id="fee"
                    value={s.fee}
                    onChange={(e) => setS({ ...s, fee: e.target.value.replace(/[^\d.]/g, "") })}
                    inputMode="decimal"
                    className="h-8"
                    placeholder="0 = free"
                  />
                </div>
              )}
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Buyers can pick up from my shop</span>
                <Switch checked={s.bulkPickup} onCheckedChange={(v) => setS({ ...s, bulkPickup: v })} />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Accept payment on delivery / pickup</span>
                <Switch checked={s.bulkPayOnDelivery} onCheckedChange={(v) => setS({ ...s, bulkPayOnDelivery: v })} />
              </label>
            </div>
          </div>
        )}
        <div className="flex justify-end">
          <Button onClick={saveSettings} disabled={busy !== null}>
            {busy === "settings" && <Loader2 className="size-4 animate-spin" />} Save settings
          </Button>
        </div>
      </Card>

      <Card className="gap-0 overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="font-semibold">Bulk prices</p>
            <p className="text-xs text-muted-foreground">
              {listed} of {items.length} products offered in bulk. Buyers must order at least the minimum quantity.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Input
              value={pct}
              onChange={(e) => setPct(e.target.value.replace(/\D/g, "").slice(0, 2))}
              className="h-8 w-14 text-center"
              aria-label="Discount percent"
            />
            <Button size="sm" variant="outline" onClick={applyDiscount} disabled={!shown.length}>
              <Percent className="size-3.5" /> below retail{q ? " (shown)" : " for all"}
            </Button>
          </div>
        </div>
        {items.length > 8 && (
          <div className="relative border-b p-3">
            <Search className="pointer-events-none absolute top-1/2 left-6 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your products" className="pl-9" />
          </div>
        )}
        {items.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Add products to your inventory first.</p>
        ) : (
          <ul className="divide-y">
            {shown.map((i) => {
              const r = rows[i.id];
              return (
                <li key={i.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-3", r.on && "bg-primary/5")}>
                  <Checkbox
                    checked={r.on}
                    onCheckedChange={(v) => setRow(i.id, { on: v === true, price: v === true && !r.price ? rupees(i.sellingPrice) : r.price })}
                    aria-label={`Sell ${i.name} in bulk`}
                  />
                  {i.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={i.image} alt="" className="size-10 shrink-0 rounded-lg border bg-white object-contain" />
                  ) : (
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted">
                      <Package className="size-4 text-muted-foreground" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="truncate text-sm font-medium">{i.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {i.variant} · retail {formatINR(i.sellingPrice)} · MRP {formatINR(i.mrp)} · {i.stock} in stock
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Bulk ₹/unit</Label>
                      <Input
                        value={r.price}
                        onChange={(e) => setRow(i.id, { price: e.target.value.replace(/[^\d.]/g, ""), on: true })}
                        inputMode="decimal"
                        className="h-8 w-24"
                        disabled={!r.on}
                        aria-label={`Bulk price for ${i.name}`}
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Min qty</Label>
                      <Input
                        value={r.minQty}
                        onChange={(e) => setRow(i.id, { minQty: e.target.value.replace(/\D/g, "") })}
                        inputMode="numeric"
                        className="h-8 w-16"
                        disabled={!r.on}
                        aria-label={`Minimum quantity for ${i.name}`}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {changed.length > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-30 px-4 md:bottom-4">
          <div className="mx-auto flex max-w-5xl items-center gap-3 rounded-2xl bg-slate-900 p-3 pl-4 text-white shadow-2xl">
            <p className="flex-1 text-sm font-semibold">
              {changed.length} unsaved change{changed.length === 1 ? "" : "s"}
            </p>
            <Button onClick={savePrices} disabled={busy !== null} className="bg-white text-slate-900 hover:bg-slate-100">
              {busy === "prices" && <Loader2 className="size-4 animate-spin" />} Save prices
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
