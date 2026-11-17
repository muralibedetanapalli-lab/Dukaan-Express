"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bike, KeyRound, Phone, Star, Store } from "lucide-react";
import type { Map as LeafletMap, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api-client";
import { fmtAgo } from "@/lib/format";

export interface Tracking {
  mode: "OWN" | "RIDER";
  status: string;
  deliveryCode: string | null;
  shop: { name: string; phone: string | null; lat: number | null; lng: number | null };
  drop: { lat: number; lng: number };
  rider: { name: string | null; phone: string | null; vehicle: string | null; lat: number | null; lng: number | null; at: string | Date | null; star?: string | null } | null;
}

const LIVE = ["SHIPMENT_CREATED", "COURIER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY"];

const dot = (color: string, emoji: string) =>
  `<div style="display:grid;place-items:center;width:34px;height:34px;border-radius:999px;background:${color};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);font-size:17px">${emoji}</div>`;

/**
 * Customer's live delivery view: handover code, rider contact and a map (OpenStreetMap via Leaflet — free, no key)
 * with the shop, the delivery address and the rider's live position, refreshed every few seconds.
 */
export function LiveTracking({ orderId, initialStatus, initial }: { orderId: string; initialStatus: string; initial: Tracking }) {
  const router = useRouter();
  const [t, setT] = useState(initial);
  const [status, setStatus] = useState(initialStatus);
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const riderMarker = useRef<Marker | null>(null);
  const live = LIVE.includes(status);

  // Poll while the delivery is in progress; refresh the page (timeline) when the status changes.
  useEffect(() => {
    if (!live) return;
    const id = setInterval(async () => {
      try {
        const r = await api<{ status: string; tracking: Tracking | null }>(`/orders/${orderId}/track`);
        if (r.tracking) setT(r.tracking);
        if (r.status !== status) {
          setStatus(r.status);
          router.refresh();
        }
      } catch {}
    }, 8000);
    return () => clearInterval(id);
  }, [orderId, live, status, router]);

  const riderPos = t.rider?.lat != null && t.rider?.lng != null ? ([t.rider.lat, t.rider.lng] as [number, number]) : null;
  const showMap = t.mode === "RIDER" && !!t.rider && live;

  // Build the map once.
  useEffect(() => {
    if (!showMap || !mapEl.current || map.current) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapEl.current) return;
      const m = L.map(mapEl.current, { zoomControl: false, attributionControl: true });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
      const icon = (c: string, e: string) => L.divIcon({ html: dot(c, e), className: "", iconSize: [34, 34], iconAnchor: [17, 17] });
      const pts: [number, number][] = [[t.drop.lat, t.drop.lng]];
      L.marker([t.drop.lat, t.drop.lng], { icon: icon("#2563eb", "🏠") }).addTo(m);
      if (t.shop.lat != null && t.shop.lng != null) {
        L.marker([t.shop.lat, t.shop.lng], { icon: icon("#15803d", "🏪") }).addTo(m);
        pts.push([t.shop.lat, t.shop.lng]);
      }
      if (riderPos) {
        riderMarker.current = L.marker(riderPos, { icon: icon("#f59e0b", "🛵"), zIndexOffset: 1000 }).addTo(m);
        pts.push(riderPos);
      }
      m.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 16 });
      map.current = m;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMap]);

  // Move the rider marker as new positions arrive.
  useEffect(() => {
    if (!map.current || !riderPos) return;
    (async () => {
      const L = (await import("leaflet")).default;
      if (riderMarker.current) riderMarker.current.setLatLng(riderPos);
      else riderMarker.current = L.marker(riderPos, { icon: L.divIcon({ html: dot("#f59e0b", "🛵"), className: "", iconSize: [34, 34], iconAnchor: [17, 17] }), zIndexOffset: 1000 }).addTo(map.current!);
    })();
  }, [riderPos?.[0], riderPos?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => void map.current?.remove(), []);

  if (!live && status !== "DELIVERY_FAILED") return null;

  return (
    <Card className="gap-3 overflow-hidden p-0">
      {t.deliveryCode && (
        <div className="flex items-center justify-between gap-3 bg-secondary px-5 py-3">
          <div className="flex items-center gap-2 text-sm">
            <KeyRound className="size-5 text-primary" />
            <span>
              <b>Delivery code</b>
              <span className="block text-xs text-muted-foreground">Tell this to the delivery person only when you receive your order</span>
            </span>
          </div>
          <span className="font-mono text-2xl font-bold tracking-[0.3em] text-primary">{t.deliveryCode}</span>
        </div>
      )}

      {status === "SHIPMENT_CREATED" && <p className="px-5 text-sm text-muted-foreground">Your order is packed. We&apos;re finding a rider near the shop…</p>}

      {t.mode === "RIDER" && t.rider && (
        <div className="flex items-center justify-between gap-3 px-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-amber-100 text-amber-700">
              <Bike className="size-5" />
            </span>
            <div className="text-sm">
              <p className="flex items-center gap-1.5 font-semibold">
                {t.rider.name}
                {t.rider.star && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
                    <Star className="size-3 fill-amber-400 text-amber-500" /> {t.rider.star}
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {status === "COURIER_ASSIGNED" ? "On the way to the shop" : "On the way to you"}
                {t.rider.vehicle ? ` · ${t.rider.vehicle}` : ""}
                {t.rider.at ? ` · updated ${fmtAgo(t.rider.at)}` : ""}
              </p>
            </div>
          </div>
          {t.rider.phone && (
            <Button asChild size="sm" variant="outline">
              <a href={`tel:${t.rider.phone}`}>
                <Phone /> Call
              </a>
            </Button>
          )}
        </div>
      )}

      {t.mode === "OWN" && live && (
        <div className="flex items-center justify-between gap-3 px-5">
          <p className="flex items-center gap-2 text-sm">
            <Store className="size-4 text-primary" /> {t.shop.name} is delivering this order with its own staff.
          </p>
          {t.shop.phone && (
            <Button asChild size="sm" variant="outline">
              <a href={`tel:${t.shop.phone}`}>
                <Phone /> Call shop
              </a>
            </Button>
          )}
        </div>
      )}

      {showMap ? (
        <div className="relative">
          <div ref={mapEl} className="h-64 w-full sm:h-80" />
          {!riderPos && <p className="absolute inset-x-0 bottom-2 mx-auto w-fit rounded-full bg-background/90 px-3 py-1 text-xs shadow">Waiting for the rider&apos;s location…</p>}
        </div>
      ) : (
        <div className="pb-1" />
      )}
    </Card>
  );
}
