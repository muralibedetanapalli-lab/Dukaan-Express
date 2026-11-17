"use client";

import { useEffect, useRef, useState } from "react";
import { Briefcase, Home, Loader2, LocateFixed, MapPin, MapPinned, User } from "lucide-react";
import type { Map as LeafletMap, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { MapPicker, type PickedPlace } from "./map-picker";

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
interface Place {
  lat: number;
  lng: number;
  city: string;
  state: string;
  pincode: string;
}

const LABELS = [
  { value: "Home", icon: Home },
  { value: "Work", icon: Briefcase },
  { value: "Other", icon: MapPin },
];
const BENGALURU = { lat: 12.9716, lng: 77.5946 };

/**
 * Add / edit a delivery address.
 * 1. Pin the exact spot: current location, or the map picker (drag the map under the pin, or search).
 * 2. Typing a pincode moves the map to that area (and fills city / state), so the picker opens in the right place.
 */
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
  const [picker, setPicker] = useState(false);
  const [hint, setHint] = useState<{ lat: number; lng: number; zoom: number } | null>(null);
  const [pinLookup, setPinLookup] = useState(false);
  const set = (k: keyof AddressValue, val: unknown) => setV((p) => ({ ...p, [k]: val }));
  const pinned = v.latitude != null && v.longitude != null;

  useEffect(() => {
    api<{ areas: Area[] }>("/location/areas").then((r) => setAreas(r.areas)).catch(() => {});
  }, []);

  // Pincode typed → find that area: move the map there and fill city / state if empty.
  useEffect(() => {
    if (!/^\d{6}$/.test(v.pincode)) return;
    let stale = false;
    const t = setTimeout(async () => {
      setPinLookup(true);
      try {
        // A configured locality with this pincode is the most precise starting point.
        const local = areas.flatMap((a) => a.localities.map((l) => ({ ...l, city: a.city, state: a.state }))).find((l) => l.pincode === v.pincode);
        const place: Place | undefined = local ?? (await api<{ places: Place[] }>(`/location/search?q=${v.pincode}`)).places[0];
        if (stale || !place) return;
        setHint({ lat: place.lat, lng: place.lng, zoom: local ? 16 : 15 });
        setV((p) => ({ ...p, city: p.city || place.city, state: p.state || place.state }));
      } catch {
        // ignore — the customer can still search on the map
      } finally {
        if (!stale) setPinLookup(false);
      }
    }, 400);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [v.pincode, areas]);

  function applyPlace(p: PickedPlace) {
    setV((prev) => ({
      ...prev,
      latitude: p.lat,
      longitude: p.lng,
      line2: prev.line2 || p.line1 || prev.line2,
      city: p.city || prev.city,
      state: p.state || prev.state,
      pincode: p.pincode || prev.pincode,
    }));
  }

  function gps() {
    if (!navigator.geolocation) return toast.error("Location isn't available on this device");
    setBusy("gps");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        try {
          const g = await api<{ formatted: string; line1: string; city: string; state: string; pincode: string }>(`/location/reverse?lat=${lat}&lng=${lng}`);
          applyPlace({ ...g, lat, lng });
        } catch {
          applyPlace({ lat, lng, line1: "", city: "", state: "", pincode: "", formatted: "" });
        }
        setBusy(null);
        toast.success("Location pinned — adjust it on the map if needed");
      },
      () => {
        setBusy(null);
        toast.error("Couldn't get your location. Choose it on the map instead.");
        setPicker(true);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  const pickerStart = pinned
    ? { lat: v.latitude!, lng: v.longitude!, zoom: 18 }
    : hint ?? (areas[0]?.localities[0] ? { lat: areas[0].localities[0].lat, lng: areas[0].localities[0].lng, zoom: 14 } : { ...BENGALURU, zoom: 12 });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!pinned) {
      toast.error("Pin your delivery location on the map first");
      return;
    }
    setBusy("save");
    try {
      const body = { ...v, id: undefined };
      const r = v.id ? await api<{ id: string }>(`/customer/addresses/${v.id}`, { method: "PATCH", body }) : await api<{ id: string }>("/customer/addresses", { body });
      toast.success("Address saved");
      onSaved(r);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <form onSubmit={save} className="grid gap-5">
      {/* 1 · Location */}
      <section className="overflow-hidden rounded-2xl border">
        {pinned ? (
          <button type="button" onClick={() => setPicker(true)} className="group relative block h-36 w-full text-left" aria-label="Adjust pin on map">
            <MiniMap lat={v.latitude!} lng={v.longitude!} />
            <span className="absolute right-2 bottom-2 z-[500] rounded-full bg-background/95 px-3 py-1.5 text-xs font-semibold text-primary shadow">Adjust pin</span>
          </button>
        ) : (
          <div className="flex flex-col items-center gap-1 bg-gradient-to-br from-emerald-50 to-lime-50 px-4 py-5 text-center dark:from-emerald-950/40 dark:to-lime-950/20">
            <span className="grid size-11 place-items-center rounded-full bg-background shadow-sm">
              <MapPinned className="size-5 text-primary" />
            </span>
            <p className="mt-1 font-semibold">Where should we deliver?</p>
            <p className="text-xs text-muted-foreground">Pin your exact gate so the rider finds you easily.</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 border-t p-3">
          <Button type="button" variant="outline" onClick={gps} disabled={!!busy}>
            {busy === "gps" ? <Loader2 className="animate-spin" /> : <LocateFixed />} Current location
          </Button>
          <Button type="button" variant={pinned ? "outline" : "default"} onClick={() => setPicker(true)} disabled={!!busy}>
            <MapPin /> {pinned ? "Change on map" : "Choose on map"}
          </Button>
        </div>
        {hint && !pinned && (
          <p className="border-t bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Map will open around pincode <b className="text-foreground">{v.pincode}</b>
            {v.city ? ` (${v.city})` : ""}.
          </p>
        )}
      </section>

      {/* 2 · Address */}
      <section className="grid gap-3">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Address</p>
        <Field label="House / flat no., building, street" value={v.line1} onChange={(x) => set("line1", x)} required placeholder="e.g. Flat 402, Prestige Acropolis, 20th Main" />
        <Field label="Area / locality" value={v.line2 ?? ""} onChange={(x) => set("line2", x)} placeholder="e.g. Koramangala 4th Block" />
        <Field label="Landmark (optional)" value={v.landmark ?? ""} onChange={(x) => set("landmark", x)} placeholder="e.g. Near Forum Mall" />
        <div className="grid grid-cols-[1fr_1.4fr] gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="pincode" className="text-xs">
              Pincode
            </Label>
            <div className="relative">
              <Input id="pincode" value={v.pincode} onChange={(e) => set("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))} required inputMode="numeric" className="h-11" placeholder="560034" />
              {pinLookup && <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
            </div>
          </div>
          <Field label="City" value={v.city} onChange={(x) => set("city", x)} required />
        </div>
        <Field label="State" value={v.state} onChange={(x) => set("state", x)} required />
      </section>

      {/* 3 · Receiver */}
      <section className="grid gap-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <User className="size-3.5" /> Receiver
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name" value={v.name} onChange={(x) => set("name", x)} required autoComplete="name" />
          <div className="grid gap-1.5">
            <Label htmlFor="phone" className="text-xs">
              Mobile number
            </Label>
            <div className="flex">
              <span className="inline-flex h-11 items-center rounded-l-md border border-r-0 bg-muted px-3 text-sm text-muted-foreground">+91</span>
              <Input id="phone" value={v.phone} onChange={(e) => set("phone", e.target.value.replace(/\D/g, "").slice(0, 10))} required inputMode="numeric" autoComplete="tel-national" className="h-11 rounded-l-none" />
            </div>
          </div>
        </div>
      </section>

      {/* 4 · Save as */}
      <section className="grid gap-2">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Save as</p>
        <div className="flex gap-2">
          {LABELS.map((l) => (
            <button
              type="button"
              key={l.value}
              onClick={() => set("label", l.value)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-medium transition-colors",
                v.label === l.value ? "border-primary bg-secondary text-primary" : "hover:bg-muted/60",
              )}
            >
              <l.icon className="size-4" /> {l.value}
            </button>
          ))}
        </div>
      </section>

      <div className="sticky -bottom-6 -mx-6 -mb-6 flex gap-2 border-t bg-background px-6 pt-3 pb-6">
        {onCancel && (
          <Button type="button" variant="outline" size="lg" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
        )}
        <Button type="submit" size="lg" disabled={!!busy} className="flex-[2]">
          {busy === "save" && <Loader2 className="animate-spin" />} Save address
        </Button>
      </div>

      {picker && (
        <MapPicker
          start={pickerStart}
          onClose={() => setPicker(false)}
          onConfirm={(p) => {
            applyPlace(p);
            setPicker(false);
          }}
        />
      )}
    </form>
  );
}

/** Small, non-interactive map showing the pinned spot. */
function MiniMap({ lat, lng }: { lat: number; lng: number }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current) return;
      if (!map.current) {
        map.current = L.map(el.current, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false, boxZoom: false, keyboard: false });
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map.current);
        const icon = L.divIcon({
          html: `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24" fill="#15803d" stroke="#fff" stroke-width="1.5"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3" fill="#fff"/></svg>`,
          className: "",
          iconSize: [34, 34],
          iconAnchor: [17, 34],
        });
        marker.current = L.marker([lat, lng], { icon }).addTo(map.current);
      }
      map.current.setView([lat, lng], 17);
      marker.current?.setLatLng([lat, lng]);
      setTimeout(() => map.current?.invalidateSize(), 50);
    })();
    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  useEffect(() => () => void map.current?.remove(), []);
  return <div ref={el} className="pointer-events-none absolute inset-0" />;
}

function Field({ label, value, onChange, ...rest }: { label: string; value: string; onChange: (v: string) => void } & Omit<React.ComponentProps<typeof Input>, "value" | "onChange">) {
  const id = label.replace(/\W+/g, "-").toLowerCase();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} className="h-11" {...rest} />
    </div>
  );
}
