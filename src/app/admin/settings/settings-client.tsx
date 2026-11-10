"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImageUploader } from "@/components/shared/image-uploader";
import { Pill } from "@/components/shared/status-badge";
import { api, errorMessage } from "@/lib/api-client";

type Kind = "text" | "money" | "percent" | "int" | "float" | "bool" | "select" | "statuses" | "image";
interface Field {
  key: string;
  label: string;
  kind: Kind;
  hint?: string;
  options?: string[];
}

const GROUPS: { key: string; label: string; fields: Field[] }[] = [
  {
    key: "platform",
    label: "Platform",
    fields: [
      { key: "name", label: "Platform name", kind: "text" },
      { key: "logoUrl", label: "Logo", kind: "image" },
      { key: "supportPhone", label: "Support phone", kind: "text" },
      { key: "supportEmail", label: "Support email", kind: "text" },
    ],
  },
  {
    key: "commission",
    label: "Commission",
    fields: [
      { key: "defaultBps", label: "Platform commission (%)", kind: "percent", hint: "Applies to shops without a shop-specific rate" },
      { key: "chargeOn", label: "Charge commission on", kind: "select", options: ["ITEMS_AFTER_COUPON", "ITEMS_BEFORE_COUPON"] },
    ],
  },
  {
    key: "order",
    label: "Orders",
    fields: [
      { key: "minOrderAmount", label: "Minimum order amount (₹)", kind: "money" },
      { key: "maxItemsPerOrder", label: "Max items per order", kind: "int" },
      { key: "shopAcceptTimeoutMinutes", label: "Auto-reject if shop doesn't respond in (min)", kind: "int" },
      { key: "paymentTimeoutMinutes", label: "Cancel unpaid online orders after (min)", kind: "int" },
    ],
  },
  {
    key: "delivery",
    label: "Delivery",
    fields: [
      { key: "baseFee", label: "Base delivery fee (₹, first 2 km)", kind: "money" },
      { key: "perKmFee", label: "Per extra km (₹)", kind: "money" },
      { key: "freeDeliveryThreshold", label: "Free delivery above (₹)", kind: "money" },
      { key: "maxRadiusKm", label: "Platform max delivery radius (km)", kind: "float" },
      { key: "avgSpeedKmph", label: "Average rider speed (km/h) for ETA", kind: "float" },
      { key: "handoverBufferMinutes", label: "Handover buffer (min)", kind: "int" },
      { key: "courierStrategy", label: "Courier auto-selection", kind: "select", options: ["FASTEST", "CHEAPEST", "RECOMMENDED"] },
      { key: "autoSchedulePickup", label: "Schedule Shiprocket pickup automatically", kind: "bool" },
    ],
  },
  {
    key: "tax",
    label: "Taxes",
    fields: [
      { key: "enabled", label: "Calculate GST", kind: "bool" },
      { key: "pricesInclusive", label: "Shop prices include GST", kind: "bool", hint: "If off, GST is added on top at checkout" },
      { key: "defaultRateBps", label: "Default GST rate (%)", kind: "percent" },
      { key: "deliveryFeeTaxBps", label: "GST on delivery fee (%)", kind: "percent" },
    ],
  },
  {
    key: "payments",
    label: "Payments",
    fields: [
      { key: "onlineEnabled", label: "Online payments (Razorpay)", kind: "bool" },
      { key: "upi", label: "UPI", kind: "bool" },
      { key: "card", label: "Credit / debit cards", kind: "bool" },
      { key: "netbanking", label: "Net banking", kind: "bool" },
      { key: "codEnabled", label: "Cash on delivery", kind: "bool" },
      { key: "codMaxAmount", label: "COD limit (₹)", kind: "money" },
    ],
  },
  {
    key: "cancellation",
    label: "Cancellation & refunds",
    fields: [
      { key: "customerCancellableStatuses", label: "Customer can cancel while order is", kind: "statuses" },
      { key: "cancellationFeePaise", label: "Cancellation fee (₹)", kind: "money" },
    ],
  },
  {
    key: "refund",
    label: "Refund rules",
    fields: [
      { key: "autoRefundOnCancel", label: "Auto-refund prepaid orders on cancellation", kind: "bool" },
      { key: "autoRefundOnReject", label: "Auto-refund when shop rejects", kind: "bool" },
    ],
  },
  {
    key: "approvals",
    label: "Approvals",
    fields: [
      { key: "shopApprovalRequired", label: "Shop registrations need approval", kind: "bool" },
      { key: "productApprovalRequired", label: "New shop-created products need approval", kind: "bool" },
    ],
  },
  {
    key: "coupons",
    label: "Coupon rules",
    fields: [
      { key: "enabled", label: "Coupons enabled", kind: "bool" },
      { key: "maxDiscountPercentOfOrder", label: "Max coupon discount (% of order)", kind: "int" },
    ],
  },
];

const CANCELLABLE = ["PAYMENT_PENDING", "PAYMENT_CONFIRMED", "SHOP_PENDING", "SHOP_ACCEPTED", "PREPARING", "READY_FOR_PACKING"];

type Settings = Record<string, Record<string, unknown>>;
interface Area {
  id: string;
  city: string;
  state: string;
  isActive: boolean;
  pincodes: string[];
  centerLat: number | null;
  centerLng: number | null;
  radiusKm: number | null;
  localities: { name: string; lat: number; lng: number; pincode: string }[];
}

export function SettingsClient({ settings, integrations, areas }: { settings: Settings; integrations: Record<string, string>; areas: Area[] }) {
  return (
    <Tabs defaultValue="platform" className="gap-4">
      <TabsList className="h-auto flex-wrap justify-start">
        {GROUPS.map((g) => (
          <TabsTrigger key={g.key} value={g.key}>
            {g.label}
          </TabsTrigger>
        ))}
        <TabsTrigger value="areas">Service areas</TabsTrigger>
        <TabsTrigger value="integrations">Integrations</TabsTrigger>
      </TabsList>
      {GROUPS.map((g) => (
        <TabsContent key={g.key} value={g.key}>
          <GroupForm group={g} initial={settings[g.key]} />
        </TabsContent>
      ))}
      <TabsContent value="areas">
        <ServiceAreas areas={areas} />
      </TabsContent>
      <TabsContent value="integrations">
        <Card className="gap-3 p-5">
          <p className="font-semibold">Third-party integrations</p>
          <p className="text-sm text-muted-foreground">
            Credentials are read from server environment variables only and never exposed to browsers. Missing credentials fall back to isolated sandbox adapters.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {Object.entries(integrations).map(([k, v]) => (
              <li key={k} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                <span className="font-medium capitalize">{k}</span>
                <Pill tone={v === "live" ? "success" : "warning"}>{v === "live" ? "live" : "sandbox"}</Pill>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">Webhook URLs: /api/v1/webhooks/razorpay · /api/v1/webhooks/shiprocket (alias /api/v1/webhooks/courier)</p>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

function toDisplay(kind: Kind, v: unknown): string | boolean | string[] {
  if (kind === "money") return String((Number(v) || 0) / 100);
  if (kind === "percent") return String((Number(v) || 0) / 100);
  if (kind === "bool") return Boolean(v);
  if (kind === "statuses") return (v as string[]) ?? [];
  return v == null ? "" : String(v);
}
function fromDisplay(kind: Kind, v: string | boolean | string[]) {
  if (kind === "money" || kind === "percent") return Math.round(Number(v) * 100);
  if (kind === "int") return Math.round(Number(v));
  if (kind === "float") return Number(v);
  if (kind === "image") return v || null;
  return v;
}

function GroupForm({ group, initial }: { group: (typeof GROUPS)[number]; initial: Record<string, unknown> }) {
  const router = useRouter();
  const [vals, setVals] = useState(() => Object.fromEntries(group.fields.map((f) => [f.key, toDisplay(f.kind, initial[f.key])])));
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const values = Object.fromEntries(group.fields.map((f) => [f.key, fromDisplay(f.kind, vals[f.key])]));
      await api("/admin/settings", { method: "PATCH", body: { group: group.key, values } });
      toast.success(`${group.label} settings saved`);
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="gap-4 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {group.fields.map((f) => (
          <div key={f.key} className={f.kind === "statuses" || f.kind === "image" ? "sm:col-span-2" : ""}>
            {f.kind === "bool" ? (
              <label className="flex items-center gap-3 rounded-lg border p-3 text-sm font-medium">
                <Switch checked={vals[f.key] as boolean} onCheckedChange={(x) => setVals({ ...vals, [f.key]: x })} />
                <span>
                  {f.label}
                  {f.hint && <span className="block text-xs font-normal text-muted-foreground">{f.hint}</span>}
                </span>
              </label>
            ) : (
              <div className="grid gap-1.5">
                <Label className="text-xs">{f.label}</Label>
                {f.kind === "select" ? (
                  <Select value={vals[f.key] as string} onValueChange={(x) => setVals({ ...vals, [f.key]: x })}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {f.options!.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o.replace(/_/g, " ").toLowerCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : f.kind === "statuses" ? (
                  <div className="flex flex-wrap gap-2">
                    {CANCELLABLE.map((s) => {
                      const on = (vals[f.key] as string[]).includes(s);
                      return (
                        <button
                          type="button"
                          key={s}
                          onClick={() => setVals({ ...vals, [f.key]: on ? (vals[f.key] as string[]).filter((x) => x !== s) : [...(vals[f.key] as string[]), s] })}
                          className={`rounded-full border px-3 py-1 text-xs ${on ? "border-primary bg-primary text-primary-foreground" : ""}`}
                        >
                          {s.replace(/_/g, " ").toLowerCase()}
                        </button>
                      );
                    })}
                  </div>
                ) : f.kind === "image" ? (
                  <ImageUploader value={vals[f.key] ? [vals[f.key] as string] : []} onChange={(u) => setVals({ ...vals, [f.key]: u[0] ?? "" })} folder="platform" max={1} />
                ) : (
                  <Input value={vals[f.key] as string} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} inputMode={f.kind === "text" ? undefined : "decimal"} />
                )}
                {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
              </div>
            )}
          </div>
        ))}
      </div>
      <Button onClick={save} disabled={busy} className="self-start">
        {busy && <Loader2 className="animate-spin" />} Save {group.label.toLowerCase()}
      </Button>
    </Card>
  );
}

function ServiceAreas({ areas }: { areas: Area[] }) {
  const router = useRouter();
  const [list, setList] = useState(areas);
  const [busy, setBusy] = useState<string | null>(null);
  const update = (id: string, patch: Partial<Area>) => setList((l) => l.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  async function save(a: Area) {
    setBusy(a.id);
    try {
      const body = { city: a.city, state: a.state, isActive: a.isActive, pincodes: a.pincodes, centerLat: a.centerLat, centerLng: a.centerLng, radiusKm: a.radiusKm, localities: a.localities };
      if (a.id.startsWith("new-")) await api("/admin/service-areas", { body });
      else await api(`/admin/service-areas/${a.id}`, { method: "PATCH", body });
      toast.success(`${a.city} saved`);
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {list.map((a) => (
        <Card key={a.id} className="gap-3 p-5">
          <div className="grid gap-3 sm:grid-cols-5">
            <Input value={a.city} onChange={(e) => update(a.id, { city: e.target.value })} placeholder="City" />
            <Input value={a.state} onChange={(e) => update(a.id, { state: e.target.value })} placeholder="State" />
            <Input value={a.centerLat ?? ""} onChange={(e) => update(a.id, { centerLat: e.target.value === "" ? null : Number(e.target.value) })} placeholder="Centre lat" />
            <Input value={a.centerLng ?? ""} onChange={(e) => update(a.id, { centerLng: e.target.value === "" ? null : Number(e.target.value) })} placeholder="Centre lng" />
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={a.isActive} onCheckedChange={(v) => update(a.id, { isActive: v })} /> Active
            </label>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Serviceable pincodes (comma separated)</Label>
            <Input value={a.pincodes.join(", ")} onChange={(e) => update(a.id, { pincodes: e.target.value.split(/[\s,]+/).filter((p) => /^\d{6}$/.test(p)) })} />
          </div>
          <div>
            <Label className="text-xs">Localities customers can pick</Label>
            <ul className="mt-2 space-y-2">
              {a.localities.map((l, i) => (
                <li key={i} className="grid grid-cols-[1fr_110px_110px_100px_auto] gap-2">
                  <Input value={l.name} onChange={(e) => update(a.id, { localities: a.localities.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} placeholder="Name" />
                  <Input value={l.lat} onChange={(e) => update(a.id, { localities: a.localities.map((x, j) => (j === i ? { ...x, lat: Number(e.target.value) } : x)) })} placeholder="Lat" />
                  <Input value={l.lng} onChange={(e) => update(a.id, { localities: a.localities.map((x, j) => (j === i ? { ...x, lng: Number(e.target.value) } : x)) })} placeholder="Lng" />
                  <Input value={l.pincode} onChange={(e) => update(a.id, { localities: a.localities.map((x, j) => (j === i ? { ...x, pincode: e.target.value } : x)) })} placeholder="Pincode" />
                  <Button size="icon" variant="ghost" onClick={() => update(a.id, { localities: a.localities.filter((_, j) => j !== i) })} aria-label="Remove locality">
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => update(a.id, { localities: [...a.localities, { name: "", lat: a.centerLat ?? 0, lng: a.centerLng ?? 0, pincode: "" }] })}>
              <Plus /> Add locality
            </Button>
          </div>
          <Button onClick={() => save(a)} disabled={busy === a.id} className="self-start">
            {busy === a.id && <Loader2 className="animate-spin" />} Save {a.city || "area"}
          </Button>
        </Card>
      ))}
      <Button variant="outline" onClick={() => setList([...list, { id: `new-${Date.now()}`, city: "", state: "", isActive: true, pincodes: [], centerLat: null, centerLng: null, radiusKm: null, localities: [] }])}>
        <Plus /> Add city
      </Button>
    </div>
  );
}
