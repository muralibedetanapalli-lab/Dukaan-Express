"use client";

import { useEffect, useState } from "react";
import { Loader2, LocateFixed } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errorMessage } from "@/lib/api-client";

export interface AddressValue {
  id?: string;
  label: string;
  name: string;
  phone: string;
  line1: string;
  line2?: string | null;
  landmark?: string | null;
  city: string;
  state: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
  isDefault?: boolean;
}

interface Area {
  city: string;
  state: string;
  localities: { name: string; lat: number; lng: number; pincode: string }[];
}

export function AddressForm({ initial, onSaved, onCancel }: { initial?: Partial<AddressValue>; onSaved: (a: { id: string }) => void; onCancel?: () => void }) {
  const [v, setV] = useState<AddressValue>({
    label: "Home",
    name: "",
    phone: "",
    line1: "",
    line2: "",
    landmark: "",
    city: "",
    state: "",
    pincode: "",
    latitude: null,
    longitude: null,
    ...initial,
  });
  const [areas, setAreas] = useState<Area[]>([]);
  const [busy, setBusy] = useState<"gps" | "save" | null>(null);
  const set = (k: keyof AddressValue, val: unknown) => setV((p) => ({ ...p, [k]: val }));

  useEffect(() => {
    api<{ areas: Area[] }>("/location/areas").then((r) => setAreas(r.areas)).catch(() => {});
  }, []);

  function gps() {
    if (!navigator.geolocation) return toast.error("Location not supported");
    setBusy("gps");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setV((p) => ({ ...p, latitude: lat, longitude: lng }));
        try {
          const g = await api<{ line1: string; city: string; state: string; pincode: string }>(`/location/reverse?lat=${lat}&lng=${lng}`);
          setV((p) => ({ ...p, line1: p.line1 || g.line1, city: g.city || p.city, state: g.state || p.state, pincode: g.pincode || p.pincode }));
        } catch {}
        setBusy(null);
        toast.success("Location pinned");
      },
      () => {
        setBusy(null);
        toast.error("Could not get your location — choose your area instead");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (v.latitude == null || v.longitude == null) return toast.error("Pin the address location: use current location or choose your area");
    setBusy("save");
    try {
      const body = { ...v, id: undefined };
      const r = v.id
        ? await api<{ id: string }>(`/customer/addresses/${v.id}`, { method: "PATCH", body })
        : await api<{ id: string }>("/customer/addresses", { body });
      toast.success("Address saved");
      onSaved(r);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const allLocalities = areas.flatMap((a) => a.localities.map((l) => ({ ...l, city: a.city, state: a.state })));

  return (
    <form onSubmit={save} className="grid gap-3">
      <div className="grid gap-2 rounded-xl border bg-muted/40 p-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase">Delivery pin</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={gps} disabled={!!busy} className="sm:flex-1">
            {busy === "gps" ? <Loader2 className="animate-spin" /> : <LocateFixed />} Use current location
          </Button>
          <Select
            onValueChange={(name) => {
              const l = allLocalities.find((x) => x.name === name);
              if (l) setV((p) => ({ ...p, latitude: l.lat, longitude: l.lng, city: l.city, state: l.state, pincode: p.pincode || l.pincode }));
            }}
          >
            <SelectTrigger className="sm:flex-1">
              <SelectValue placeholder="…or choose your area" />
            </SelectTrigger>
            <SelectContent>
              {allLocalities.map((l) => (
                <SelectItem key={l.name} value={l.name}>
                  {l.name}, {l.city}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {v.latitude != null && (
          <p className="text-xs text-emerald-700">
            Pinned at {v.latitude.toFixed(4)}, {v.longitude!.toFixed(4)}
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Full name" value={v.name} onChange={(x) => set("name", x)} required />
        <Field label="Phone" value={v.phone} onChange={(x) => set("phone", x.replace(/\D/g, "").slice(0, 10))} required inputMode="numeric" />
      </div>
      <Field label="Flat / house no., building, street" value={v.line1} onChange={(x) => set("line1", x)} required />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Area / locality (optional)" value={v.line2 ?? ""} onChange={(x) => set("line2", x)} />
        <Field label="Landmark (optional)" value={v.landmark ?? ""} onChange={(x) => set("landmark", x)} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="City" value={v.city} onChange={(x) => set("city", x)} required />
        <Field label="State" value={v.state} onChange={(x) => set("state", x)} required />
        <Field label="Pincode" value={v.pincode} onChange={(x) => set("pincode", x.replace(/\D/g, "").slice(0, 6))} required inputMode="numeric" />
      </div>
      <div className="flex gap-2">
        {["Home", "Work", "Other"].map((l) => (
          <button
            type="button"
            key={l}
            onClick={() => set("label", l)}
            className={`rounded-full border px-3 py-1 text-sm ${v.label === l ? "border-primary bg-secondary font-semibold text-primary" : ""}`}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={!!busy}>
          {busy === "save" && <Loader2 className="animate-spin" />} Save address
        </Button>
      </div>
    </form>
  );
}

function Field({ label, value, onChange, ...rest }: { label: string; value: string; onChange: (v: string) => void } & Omit<React.ComponentProps<typeof Input>, "value" | "onChange">) {
  const id = label.replace(/\W+/g, "-").toLowerCase();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
    </div>
  );
}
