"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, LocateFixed, MapPin, Search } from "lucide-react";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api-client";

export interface PickedPlace {
  lat: number;
  lng: number;
  line1: string;
  city: string;
  state: string;
  pincode: string;
  formatted: string;
}
interface Place {
  lat: number;
  lng: number;
  label: string;
  city: string;
  state: string;
  pincode: string;
}

/**
 * Full-screen map to pin the exact delivery spot: drag the map under the fixed pin, or search an area / pincode.
 * OpenStreetMap tiles via Leaflet (free, no key). The address under the pin is looked up as the map settles.
 */
export function MapPicker({
  start,
  onConfirm,
  onClose,
  pinLabel = "Your order will be delivered here",
  locateOnOpen = false,
}: {
  start: { lat: number; lng: number; zoom?: number };
  onConfirm: (p: PickedPlace) => void;
  onClose: () => void;
  /** Text on the pin, e.g. "The shop is here". */
  pinLabel?: string;
  /** Jump to the device's GPS position when the map opens (e.g. a dealer standing at the shop). */
  locateOnOpen?: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const [center, setCenter] = useState({ lat: start.lat, lng: start.lng });
  const [moving, setMoving] = useState(false);
  const [addr, setAddr] = useState<PickedPlace | null>(null);
  const [looking, setLooking] = useState(true);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const lookupSeq = useRef(0);

  // Build the map.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current) return;
      const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([start.lat, start.lng], start.zoom ?? 17);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
      L.control.zoom({ position: "bottomright" }).addTo(m);
      m.on("movestart", () => {
        setMoving(true);
        setLooking(true);
      });
      m.on("moveend", () => {
        setMoving(false);
        const c = m.getCenter();
        setCenter({ lat: c.lat, lng: c.lng });
      });
      map.current = m;
      setTimeout(() => m.invalidateSize(), 50);
      if (locateOnOpen && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => !cancelled && m.setView([pos.coords.latitude, pos.coords.longitude], 18),
          () => {},
          { enableHighAccuracy: true, timeout: 10_000 },
        );
      }
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Address under the pin (debounced; the server queues and caches lookups).
  useEffect(() => {
    const seq = ++lookupSeq.current;
    const t = setTimeout(async () => {
      try {
        const g = await api<{ formatted: string; line1: string; city: string; state: string; pincode: string }>(`/location/reverse?lat=${center.lat}&lng=${center.lng}`);
        if (seq === lookupSeq.current) setAddr({ ...g, lat: center.lat, lng: center.lng });
      } catch {
        if (seq === lookupSeq.current) setAddr({ lat: center.lat, lng: center.lng, line1: "", city: "", state: "", pincode: "", formatted: "" });
      } finally {
        if (seq === lookupSeq.current) setLooking(false);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [center.lat, center.lng]);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    if (q.trim().length < 3) return;
    setSearching(true);
    try {
      const r = await api<{ places: Place[] }>(`/location/search?q=${encodeURIComponent(q.trim())}`);
      setResults(r.places);
      if (!r.places.length) toast.error("Couldn't find that place. Try an area name or pincode.");
      else if (r.places.length === 1) goTo(r.places[0], /^\d{6}$/.test(q.trim()) ? 15 : 16);
    } catch {
      toast.error("Search failed. Please try again.");
    } finally {
      setSearching(false);
    }
  }

  function goTo(p: { lat: number; lng: number }, zoom = 17) {
    map.current?.setView([p.lat, p.lng], zoom);
    setResults([]);
  }

  function myLocation() {
    if (!navigator.geolocation) return toast.error("Location isn't available on this device");
    const ok = (pos: GeolocationPosition) => goTo({ lat: pos.coords.latitude, lng: pos.coords.longitude }, 18);
    const fail = (e: GeolocationPositionError) =>
      toast.error(
        e.code === e.PERMISSION_DENIED
          ? "Location permission is off. Allow it for this app in your phone's Settings (Apps → Permissions → Location), or search your area."
          : "Couldn't get your location. Turn on location (GPS), or search your area.",
      );
    // Precise GPS first; indoors it often times out, so fall back to a quicker network-based fix.
    navigator.geolocation.getCurrentPosition(
      ok,
      (e) => {
        if (e.code === e.PERMISSION_DENIED) return fail(e);
        navigator.geolocation.getCurrentPosition(ok, fail, { enableHighAccuracy: false, timeout: 15_000, maximumAge: 120_000 });
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    // Its own full-screen dialog, so it works on top of the address dialog (focus, scrolling, back button).
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton={false}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100 sm:max-w-none"
      >
      <DialogTitle className="sr-only">Pin your delivery location</DialogTitle>
      <div className="flex items-center gap-2 border-b p-3">
        <Button type="button" size="icon" variant="ghost" onClick={onClose} aria-label="Back">
          <ArrowLeft />
        </Button>
        <form onSubmit={search} className="relative flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search area, street or pincode" className="h-11 rounded-full pr-10 pl-9" enterKeyHint="search" />
          {searching && <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
        </form>
      </div>

      {results.length > 1 && (
        <ul className="absolute inset-x-3 top-[68px] z-[1001] max-h-64 overflow-y-auto rounded-xl border bg-background shadow-lg">
          {results.map((r, i) => (
            <li key={i}>
              <button type="button" onClick={() => goTo(r, 15)} className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted">
                <MapPin className="mt-0.5 size-4 shrink-0 text-primary" /> {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative flex-1">
        <div ref={el} className="absolute inset-0" />
        {/* Fixed pin in the centre: the map moves underneath it. */}
        <div className="pointer-events-none absolute top-1/2 left-1/2 z-[1000] -translate-x-1/2 -translate-y-full">
          <div className={`flex flex-col items-center transition-transform ${moving ? "-translate-y-2" : ""}`}>
            <span className="mb-1 rounded-full bg-foreground px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-background shadow">
              {moving ? "Release to set" : pinLabel}
            </span>
            <MapPin className="size-10 fill-primary text-primary-foreground drop-shadow-lg" strokeWidth={1.5} />
          </div>
        </div>
        <Button type="button" variant="outline" onClick={myLocation} className="absolute bottom-20 left-1/2 z-[1000] -translate-x-1/2 rounded-full bg-background shadow-md">
          <LocateFixed /> Use my current location
        </Button>
      </div>

      <div className="space-y-3 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="min-w-0 text-sm">
            {looking && !addr ? (
              <p className="text-muted-foreground">Finding address…</p>
            ) : (
              <>
                <p className="font-semibold">{addr?.line1 || addr?.formatted || "Pinned location"}</p>
                <p className="truncate text-xs text-muted-foreground">{[addr?.city, addr?.state, addr?.pincode].filter(Boolean).join(", ") || `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`}</p>
              </>
            )}
          </div>
        </div>
        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={moving}
          onClick={() => onConfirm(addr && addr.lat === center.lat ? addr : { lat: center.lat, lng: center.lng, line1: "", city: "", state: "", pincode: "", formatted: "" })}
        >
          {looking && <Loader2 className="animate-spin" />} Confirm location
        </Button>
      </div>
      </DialogContent>
    </Dialog>
  );
}
