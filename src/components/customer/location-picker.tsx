"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Home, Loader2, LocateFixed, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api-client";

interface Loc {
  lat: number;
  lng: number;
  label: string;
  pincode?: string | null;
  addressId?: string | null;
}
interface Area {
  city: string;
  localities: { name: string; lat: number; lng: number; pincode: string }[];
}
interface Addr {
  id: string;
  label: string;
  line1: string;
  city: string;
  pincode: string;
  latitude: number;
  longitude: number;
}

export function LocationPicker({ current, loggedIn, eta }: { current: Loc | null; loggedIn: boolean; eta?: number | null }) {
  const [open, setOpen] = useState(!current);
  return (
    <>
      <button onClick={() => setOpen(true)} className="min-w-0 text-left">
        <p className="text-sm leading-tight font-extrabold">{current ? (eta ? `Delivery in ${eta} minutes` : "Delivering to") : "Set delivery location"}</p>
        <p className="flex items-center gap-0.5 truncate text-xs text-muted-foreground">
          <span className="truncate">{current?.label ?? "Choose where you want your order delivered"}</span>
          <ChevronDown className="size-3.5 shrink-0" />
        </p>
      </button>
      <LocationSheet open={open} onOpenChange={setOpen} loggedIn={loggedIn} dismissible={!!current} />
    </>
  );
}

export function LocationSheet({ open, onOpenChange, loggedIn, dismissible = true }: { open: boolean; onOpenChange: (o: boolean) => void; loggedIn: boolean; dismissible?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [addresses, setAddresses] = useState<Addr[]>([]);

  useEffect(() => {
    if (!open) return;
    api<{ areas: Area[] }>("/location/areas").then((r) => setAreas(r.areas)).catch(() => {});
    if (loggedIn) api<{ addresses: Addr[] }>("/customer/addresses").then((r) => setAddresses(r.addresses)).catch(() => {});
  }, [open, loggedIn]);

  async function choose(loc: Loc, key: string) {
    setBusy(key);
    try {
      const r = await api<{ serviceable: boolean; shopCount: number }>("/location", { body: loc });
      if (!r.serviceable) toast.warning("No shops deliver to this location yet. Try another area.");
      else toast.success(`${r.shopCount} shop${r.shopCount > 1 ? "s" : ""} deliver here`);
      onOpenChange(false);
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  function detect() {
    if (!navigator.geolocation) return toast.error("Location is not supported by this browser");
    setBusy("gps");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        let label = "Current location";
        let pincode: string | null = null;
        try {
          const g = await api<{ formatted: string; pincode: string }>(`/location/reverse?lat=${lat}&lng=${lng}`);
          label = g.formatted || label;
          pincode = g.pincode || null;
        } catch {}
        await choose({ lat, lng, label, pincode }, "gps");
      },
      (err) => {
        setBusy(null);
        toast.error(err.code === err.PERMISSION_DENIED ? "Location permission denied. Pick your area below." : "Could not detect your location");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <Sheet open={open} onOpenChange={(o) => (dismissible || o ? onOpenChange(o) : null)}>
      <SheetContent side="bottom" className="mx-auto max-h-[85dvh] max-w-xl overflow-y-auto rounded-t-3xl">
        <SheetHeader>
          <SheetTitle>Where should we deliver?</SheetTitle>
          <SheetDescription>We&apos;ll show shops and products available at your location.</SheetDescription>
        </SheetHeader>
        <div className="grid gap-5 px-4 pb-6">
          <Button size="lg" onClick={detect} disabled={!!busy}>
            {busy === "gps" ? <Loader2 className="animate-spin" /> : <LocateFixed />} Use my current location
          </Button>

          {addresses.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Saved addresses</p>
              <ul className="grid gap-2">
                {addresses.map((a) => (
                  <li key={a.id}>
                    <button
                      disabled={!!busy}
                      onClick={() => choose({ lat: a.latitude, lng: a.longitude, label: `${a.label} · ${a.line1}`, pincode: a.pincode, addressId: a.id }, a.id)}
                      className="flex w-full items-start gap-3 rounded-xl border p-3 text-left hover:bg-muted"
                    >
                      <Home className="mt-0.5 size-4 text-primary" />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{a.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {a.line1}, {a.city} {a.pincode}
                        </span>
                      </span>
                      {busy === a.id && <Loader2 className="ml-auto size-4 animate-spin" />}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {areas.map((area) => (
            <div key={area.city}>
              <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Areas we serve in {area.city}</p>
              <div className="flex flex-wrap gap-2">
                {area.localities.map((l) => (
                  <button
                    key={l.name}
                    disabled={!!busy}
                    onClick={() => choose({ lat: l.lat, lng: l.lng, label: `${l.name}, ${area.city}`, pincode: l.pincode }, l.name)}
                    className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm hover:border-primary hover:text-primary"
                  >
                    {busy === l.name ? <Loader2 className="size-3.5 animate-spin" /> : <MapPin className="size-3.5" />} {l.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
