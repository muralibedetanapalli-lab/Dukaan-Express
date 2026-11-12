"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LocateFixed } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ImageUploader } from "@/components/shared/image-uploader";
import { api, errorMessage } from "@/lib/api-client";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface ShopFormValue {
  id?: string;
  name: string;
  description: string;
  categoryId: string;
  ownerId: string;
  contactPhone: string;
  contactEmail: string;
  gstNumber: string;
  logoUrl: string | null;
  images: string[];
  deliveryRadiusKm: string;
  commissionPercent: string; // blank → platform default
  avgPrepMinutes: string;
  address: { line1: string; line2: string; landmark: string; city: string; state: string; pincode: string; latitude: string; longitude: string };
  hours: { dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean }[];
}

export const blankShop: ShopFormValue = {
  name: "",
  description: "",
  categoryId: "",
  ownerId: "",
  contactPhone: "",
  contactEmail: "",
  gstNumber: "",
  logoUrl: null,
  images: [],
  deliveryRadiusKm: "5",
  commissionPercent: "",
  avgPrepMinutes: "10",
  address: { line1: "", line2: "", landmark: "", city: "", state: "", pincode: "", latitude: "", longitude: "" },
  hours: DAYS.map((_, d) => ({ dayOfWeek: d, openTime: "07:00", closeTime: "23:00", isClosed: false })),
};

export function ShopForm({
  initial,
  categories,
  owners,
  defaultCommission,
  mode = "admin",
}: {
  initial?: ShopFormValue;
  categories: { id: string; name: string }[];
  owners: { id: string; name: string; email: string }[];
  defaultCommission: number;
  /** "dealer": onboarding by a regional dealer — also creates the owner login; commission stays with the admin. */
  mode?: "admin" | "dealer";
}) {
  const router = useRouter();
  const dealer = mode === "dealer";
  const [v, setV] = useState<ShopFormValue>(initial ?? blankShop);
  const [owner, setOwner] = useState({ name: "", email: "", phone: "", password: "" });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ShopFormValue>(k: K, val: ShopFormValue[K]) => setV((p) => ({ ...p, [k]: val }));
  const setA = (k: keyof ShopFormValue["address"], val: string) => setV((p) => ({ ...p, address: { ...p.address, [k]: val } }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body = {
        name: v.name,
        description: v.description || null,
        categoryId: v.categoryId || null,
        ownerId: v.ownerId || null,
        contactPhone: v.contactPhone,
        contactEmail: v.contactEmail || null,
        gstNumber: v.gstNumber || null,
        logoUrl: v.logoUrl,
        images: v.images,
        deliveryRadiusKm: Number(v.deliveryRadiusKm),
        commissionBps: v.commissionPercent === "" ? null : Math.round(Number(v.commissionPercent) * 100),
        avgPrepMinutes: Number(v.avgPrepMinutes) || 10,
        address: { ...v.address, line2: v.address.line2 || null, landmark: v.address.landmark || null, latitude: Number(v.address.latitude), longitude: Number(v.address.longitude) },
        hours: v.hours,
      };
      if (dealer) {
        const { ownerId: _o, commissionBps: _c, ...rest } = body;
        const created = await api<{ id: string }>("/dealer/shops", { body: { ...rest, owner: { ...owner, phone: owner.phone || v.contactPhone } } });
        toast.success("Shop onboarded and live. Share the login with the owner.");
        router.push(`/dealer/shops/${created.id}`);
        router.refresh();
        return;
      }
      const r = v.id ? await api<{ id: string }>(`/admin/shops/${v.id}`, { method: "PATCH", body }) : await api<{ id: string }>("/admin/shops", { body });
      toast.success(v.id ? "Shop updated" : "Shop onboarded — activate it once ready");
      router.push(`/admin/shops/${r.id}`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Card className="gap-4 p-5">
        <p className="font-semibold">Basic details</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <F label="Shop name *">
            <Input value={v.name} onChange={(e) => set("name", e.target.value)} required minLength={2} />
          </F>
          <F label="Shop category">
            <Select value={v.categoryId} onValueChange={(x) => set("categoryId", x)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </F>
          {!dealer && (
            <F label="Shop owner">
              <Select value={v.ownerId} onValueChange={(x) => set("ownerId", x)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Assign owner" />
                </SelectTrigger>
                <SelectContent>
                  {owners.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name} ({o.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </F>
          )}
          <F label="GST number (optional)">
            <Input value={v.gstNumber} onChange={(e) => set("gstNumber", e.target.value.toUpperCase())} maxLength={15} placeholder="29ABCDE1234F1Z5" />
          </F>
          <F label="Mobile number *">
            <Input value={v.contactPhone} onChange={(e) => set("contactPhone", e.target.value.replace(/\D/g, "").slice(0, 10))} required inputMode="numeric" />
          </F>
          <F label="Email">
            <Input type="email" value={v.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} />
          </F>
        </div>
        <F label="Description">
          <Textarea value={v.description} onChange={(e) => set("description", e.target.value)} rows={2} maxLength={500} />
        </F>
        <div className="grid gap-4 sm:grid-cols-2">
          <F label="Logo">
            <ImageUploader value={v.logoUrl ? [v.logoUrl] : []} onChange={(u) => set("logoUrl", u[0] ?? null)} folder="shops" max={1} />
          </F>
          <F label="Shop images">
            <ImageUploader value={v.images} onChange={(u) => set("images", u)} folder="shops" max={6} />
          </F>
        </div>
      </Card>

      {dealer && (
        <Card className="gap-4 p-5">
          <div>
            <p className="font-semibold">Shop owner login</p>
            <p className="text-xs text-muted-foreground">
              The owner logs in to the Dukaan Partner app with these. Share the password with them; they can change it with “Forgot password”.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <F label="Owner name *">
              <Input value={owner.name} onChange={(e) => setOwner({ ...owner, name: e.target.value })} required minLength={2} />
            </F>
            <F label="Owner email *">
              <Input type="email" value={owner.email} onChange={(e) => setOwner({ ...owner, email: e.target.value })} required autoComplete="off" />
            </F>
            <F label="Owner mobile (blank = shop mobile)">
              <Input
                value={owner.phone}
                onChange={(e) => setOwner({ ...owner, phone: e.target.value.replace(/D/g, "").slice(0, 10) })}
                inputMode="numeric"
                placeholder={v.contactPhone}
              />
            </F>
            <F label="Password * (8+ characters, letters and numbers)">
              <Input value={owner.password} onChange={(e) => setOwner({ ...owner, password: e.target.value })} required minLength={8} autoComplete="new-password" />
            </F>
          </div>
        </Card>
      )}

      <Card className="gap-4 p-5">
        <div className="flex items-center justify-between">
          <p className="font-semibold">Address & location</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              navigator.geolocation?.getCurrentPosition(
                (p) => setV((x) => ({ ...x, address: { ...x.address, latitude: p.coords.latitude.toFixed(6), longitude: p.coords.longitude.toFixed(6) } })),
                () => toast.error("Could not get location"),
              )
            }
          >
            <LocateFixed /> Use my location
          </Button>
        </div>
        <F label="Address line *">
          <Input value={v.address.line1} onChange={(e) => setA("line1", e.target.value)} required minLength={3} />
        </F>
        <div className="grid gap-3 sm:grid-cols-2">
          <F label="Address line 2">
            <Input value={v.address.line2} onChange={(e) => setA("line2", e.target.value)} />
          </F>
          <F label="Landmark">
            <Input value={v.address.landmark} onChange={(e) => setA("landmark", e.target.value)} />
          </F>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <F label="City *">
            <Input value={v.address.city} onChange={(e) => setA("city", e.target.value)} required />
          </F>
          <F label="State *">
            <Input value={v.address.state} onChange={(e) => setA("state", e.target.value)} required />
          </F>
          <F label="Pincode *">
            <Input value={v.address.pincode} onChange={(e) => setA("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))} required inputMode="numeric" />
          </F>
          <F label="Latitude *">
            <Input value={v.address.latitude} onChange={(e) => setA("latitude", e.target.value)} required inputMode="decimal" />
          </F>
          <F label="Longitude *">
            <Input value={v.address.longitude} onChange={(e) => setA("longitude", e.target.value)} required inputMode="decimal" />
          </F>
        </div>
        <p className="text-xs text-muted-foreground">The address is registered as the Shiprocket pickup location the first time a shipment is created.</p>
      </Card>

      <Card className="gap-4 p-5">
        <p className="font-semibold">Delivery & commercial</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <F label="Delivery radius (km) *">
            <Input value={v.deliveryRadiusKm} onChange={(e) => set("deliveryRadiusKm", e.target.value)} required inputMode="decimal" />
          </F>
          {!dealer && (
            <F label={`Commission % (blank = platform default ${defaultCommission}%)`}>
              <Input value={v.commissionPercent} onChange={(e) => set("commissionPercent", e.target.value)} inputMode="decimal" placeholder={String(defaultCommission)} />
            </F>
          )}
          <F label="Avg. prep time (min)">
            <Input value={v.avgPrepMinutes} onChange={(e) => set("avgPrepMinutes", e.target.value)} inputMode="numeric" />
          </F>
        </div>
        <div>
          <Label className="mb-2 block text-xs">Opening & closing hours</Label>
          <ul className="grid gap-2 sm:grid-cols-2">
            {v.hours.map((h, i) => (
              <li key={h.dayOfWeek} className="flex items-center gap-2">
                <span className="w-10 text-sm font-medium">{DAYS[h.dayOfWeek]}</span>
                <Switch
                  checked={!h.isClosed}
                  onCheckedChange={(on) => set("hours", v.hours.map((x, j) => (j === i ? { ...x, isClosed: !on } : x)))}
                  aria-label={`${DAYS[h.dayOfWeek]} open`}
                />
                <Input type="time" value={h.openTime} disabled={h.isClosed} onChange={(e) => set("hours", v.hours.map((x, j) => (j === i ? { ...x, openTime: e.target.value } : x)))} className="w-28" />
                <Input type="time" value={h.closeTime} disabled={h.isClosed} onChange={(e) => set("hours", v.hours.map((x, j) => (j === i ? { ...x, closeTime: e.target.value } : x)))} className="w-28" />
              </li>
            ))}
          </ul>
        </div>
      </Card>
      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} {v.id ? "Save changes" : dealer ? "Onboard shop & go live" : "Onboard shop"}
        </Button>
      </div>
    </form>
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
