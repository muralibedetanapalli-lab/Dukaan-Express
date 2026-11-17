"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bike, LogOut, MapPinOff, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { RealtimeListener } from "@/components/shared/realtime";
import { api, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/rider", label: "Deliveries", icon: Bike },
  { href: "/rider/wallet", label: "Wallet", icon: Wallet },
];
const SEND_EVERY_MS = 15_000;

/**
 * Rider shell: online switch, bottom navigation, job alerts, and live location sharing.
 * While online the phone's GPS position is sent every ~15 s (it is what customers see on their map), and the
 * screen is kept awake during an active delivery so the location keeps flowing.
 */
export function RiderChrome({
  name,
  vehicle,
  online: initialOnline,
  busy,
  approved = true,
  children,
}: {
  name: string;
  vehicle: string | null;
  online: boolean;
  busy: boolean;
  /** Not yet verified: no online switch, no tabs — just the documents screen. */
  approved?: boolean;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const [online, setOnline] = useState(initialOnline);
  const [geoError, setGeoError] = useState<string | null>(null);
  const lastSent = useRef(0);

  // Share location while online.
  useEffect(() => {
    if (!approved || !online || !("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setGeoError(null);
        if (Date.now() - lastSent.current < SEND_EVERY_MS) return;
        lastSent.current = Date.now();
        api("/rider/location", { body: { lat: p.coords.latitude, lng: p.coords.longitude } }).catch(() => {});
      },
      (e) => setGeoError(e.code === e.PERMISSION_DENIED ? "Location is blocked. Allow location for Dukaan Rider so customers can track you." : "Can't get your location right now."),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [online, approved]);

  // Keep the screen on during a delivery (location sharing stops when the phone sleeps).
  useEffect(() => {
    if (!busy || !("wakeLock" in navigator)) return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    const acquire = () => nav.wakeLock.request("screen").then((l) => (lock = l)).catch(() => {});
    acquire();
    const onVisible = () => document.visibilityState === "visible" && acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, [busy]);

  // Waiting for jobs: refresh the list now and then (alerts also refresh it).
  useEffect(() => {
    if (!online || busy || path !== "/rider") return;
    const id = setInterval(() => router.refresh(), 20_000);
    return () => clearInterval(id);
  }, [online, busy, path, router]);

  async function toggle(v: boolean) {
    setOnline(v);
    try {
      await api("/rider/status", { method: "PATCH", body: { online: v } });
      toast.success(v ? "You're online — new deliveries near you will alert you" : "You're offline");
      router.refresh();
    } catch (e) {
      setOnline(!v);
      toast.error(errorMessage(e));
    }
  }

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    router.replace("/login/staff");
    router.refresh();
  }

  const isActive = (href: string) => (href === "/rider" ? path === "/rider" : path.startsWith(href));

  return (
    <div className="min-h-dvh bg-muted/30">
      <RealtimeListener sound />
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-xl items-center gap-3 px-4">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex min-w-0 items-center gap-2 text-left">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
                <Bike className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm leading-tight font-bold">{name}</span>
                <span className="block truncate text-xs text-muted-foreground">{vehicle ?? "Rider"}</span>
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Dukaan Rider</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout}>
                <LogOut /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {approved ? (
          <label className="ml-auto flex items-center gap-2 text-xs font-semibold">
            <span className={online ? "text-primary" : "text-muted-foreground"}>{online ? "Online" : "Offline"}</span>
            <Switch checked={online} onCheckedChange={toggle} aria-label="Online for deliveries" />
          </label>
          ) : (
            <span className="ml-auto text-xs font-semibold text-muted-foreground">Verification</span>
          )}
        </div>
        {online && geoError && (
          <p className="flex items-center justify-center gap-1.5 bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-900">
            <MapPinOff className="size-3.5" /> {geoError}
          </p>
        )}
      </header>
      <main className="mx-auto max-w-xl px-4 pt-4 pb-24">{children}</main>
      {approved && <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto grid max-w-xl grid-cols-2">
          {NAV.map((n) => (
            <li key={n.href}>
              <Link href={n.href} className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold", isActive(n.href) ? "text-primary" : "text-muted-foreground")}>
                <n.icon className="size-5" />
                {n.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>}
    </div>
  );
}
