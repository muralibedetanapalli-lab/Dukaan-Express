"use client";

import { useEffect, useRef, useState } from "react";
import { Navigation } from "lucide-react";
import type { LayerGroup, Map as LeafletMap, Marker, Polyline } from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";

interface Route {
  points: [number, number][];
  distanceKm: number;
  durationMinutes: number | null;
  source: string;
}

const dot = (color: string, emoji: string) =>
  `<div style="display:grid;place-items:center;width:34px;height:34px;border-radius:999px;background:${color};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);font-size:17px">${emoji}</div>`;

/** Google Maps turn-by-turn to the point. In the app this opens the Google Maps app (Android hands it the link). */
export const navigateUrl = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving&dir_action=navigate`;

/**
 * Rider's map for the current leg (to the shop, then to the customer): their live position, the destination,
 * the road route (OpenRouteService, free) with distance and time, and a big Navigate button.
 */
export function RouteMap({ to, kind, label }: { to: { lat: number; lng: number }; kind: "shop" | "customer"; label: string }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layers = useRef<{ me: Marker | null; line: Polyline | null; group: LayerGroup | null }>({ me: null, line: null, group: null });
  const fitted = useRef(false);
  const [me, setMe] = useState<[number, number] | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [gpsError, setGpsError] = useState(false);

  // Rider's own position.
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setGpsError(false);
        setMe([p.coords.latitude, p.coords.longitude]);
      },
      () => setGpsError(true),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Build the map with the destination.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current) return;
      const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([to.lat, to.lng], 15);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
      layers.current.group = L.layerGroup().addTo(m);
      L.marker([to.lat, to.lng], { icon: L.divIcon({ html: kind === "shop" ? dot("#15803d", "🏪") : dot("#2563eb", "🏠"), className: "", iconSize: [34, 34], iconAnchor: [17, 17] }) }).addTo(m);
      map.current = m;
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      layers.current = { me: null, line: null, group: null };
      fitted.current = false;
    };
  }, [to.lat, to.lng, kind]);

  // Road route: fetched when the rider has moved ~100 m (the server caches on a ~110 m grid).
  const meKey = me ? `${me[0].toFixed(3)},${me[1].toFixed(3)}` : null;
  useEffect(() => {
    if (!me) return;
    let stale = false;
    api<Route>(`/rider/route?fromLat=${me[0]}&fromLng=${me[1]}&toLat=${to.lat}&toLng=${to.lng}`)
      .then((r) => !stale && setRoute(r))
      .catch(() => {});
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meKey, to.lat, to.lng]);

  // Draw the rider marker and route.
  useEffect(() => {
    (async () => {
      const m = map.current;
      if (!m || !me) return;
      const L = (await import("leaflet")).default;
      const l = layers.current;
      if (l.me) l.me.setLatLng(me);
      else l.me = L.marker(me, { icon: L.divIcon({ html: dot("#f59e0b", "🛵"), className: "", iconSize: [34, 34], iconAnchor: [17, 17] }), zIndexOffset: 1000 }).addTo(m);
      if (route) {
        l.line?.remove();
        l.line = L.polyline(route.points, route.source === "haversine" ? { color: "#2563eb", weight: 4, dashArray: "6 8" } : { color: "#2563eb", weight: 5, opacity: 0.85 }).addTo(l.group ?? m);
      }
      if (!fitted.current) {
        fitted.current = true;
        m.fitBounds(L.latLngBounds([me, [to.lat, to.lng]]), { padding: [40, 40], maxZoom: 16 });
      }
    })();
  }, [me, route, to.lat, to.lng]);

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="relative">
        <div ref={el} className="h-56 w-full" />
        {(route || gpsError) && (
          <p className="absolute top-2 left-2 z-[1000] rounded-full bg-background/95 px-3 py-1 text-xs font-semibold shadow">
            {route ? `${route.distanceKm.toFixed(1)} km${route.durationMinutes ? ` · ${route.durationMinutes} min` : ""}` : "Turn on location to see your route"}
          </p>
        )}
      </div>
      <Button asChild size="lg" className="h-12 w-full rounded-none text-base">
        <a href={navigateUrl(to.lat, to.lng)} target="_blank" rel="noreferrer">
          <Navigation /> Navigate to {label}
        </a>
      </Button>
    </div>
  );
}
