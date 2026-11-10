"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";

/**
 * Glue between the website and the Capacitor Android apps (mobile/customer, mobile/shop).
 * Inside a browser this is a no-op. Inside the app, Capacitor injects `window.Capacitor`
 * and the native plugins become available as `Capacitor.Plugins.*`.
 */
interface Listener {
  remove: () => Promise<void>;
}
interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins: Record<string, Record<string, (...args: never[]) => Promise<unknown>> & {
    addListener?: (event: string, cb: (data: never) => void) => Promise<Listener>;
  }>;
}

export function nativeApp(): CapacitorGlobal | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return cap?.isNativePlatform?.() ? cap : null;
}

/** Push is enabled per build: the app appends "push=1" to its user agent once Firebase is configured. */
const pushEnabled = () => typeof navigator !== "undefined" && /DukaanApp\/[^ ]*.*push=1/.test(navigator.userAgent);

/** Mounted once in the root layout: hides the splash screen as soon as the page is interactive. */
export function NativeBridge() {
  useEffect(() => {
    const cap = nativeApp();
    if (!cap) return;
    document.documentElement.dataset.native = cap.getPlatform?.() ?? "native";
    void cap.Plugins.SplashScreen?.hide?.();
  }, []);
  return null;
}

/**
 * Mounted wherever a signed-in user is (inside NotificationBell). Registers the device for FCM push,
 * stores the token on the server, and opens the right screen when a notification is tapped.
 */
export function PushRegistrar() {
  const router = useRouter();
  useEffect(() => {
    const cap = nativeApp();
    if (!cap || !pushEnabled()) return;
    const push = cap.Plugins.PushNotifications as unknown as {
      checkPermissions: () => Promise<{ receive: string }>;
      requestPermissions: () => Promise<{ receive: string }>;
      register: () => Promise<void>;
      createChannel: (c: Record<string, unknown>) => Promise<void>;
      addListener: (event: string, cb: (data: never) => void) => Promise<Listener>;
    };
    if (!push) return;
    const listeners: Promise<Listener>[] = [];
    let cancelled = false;

    (async () => {
      try {
        // Channels: order alerts are loud & high priority; everything else is normal.
        await push.createChannel({ id: "orders", name: "New orders", description: "New order alerts", importance: 5, sound: "default", vibration: true, visibility: 1 });
        await push.createChannel({ id: "general", name: "Order updates", description: "Order status and account updates", importance: 3 });

        listeners.push(
          push.addListener("registration", (async ({ value }: { value: string }) => {
            if (cancelled) return;
            try {
              if (localStorage.getItem("dx_push_token") === value) return;
            } catch {}
            await api("/devices", { body: { token: value, platform: "android" } }).catch(() => {});
            try {
              localStorage.setItem("dx_push_token", value);
            } catch {}
          }) as never),
        );
        listeners.push(
          push.addListener("pushNotificationActionPerformed", (({ notification }: { notification: { data?: { link?: string } } }) => {
            const link = notification?.data?.link;
            if (link && link.startsWith("/")) router.push(link);
          }) as never),
        );

        let perm = await push.checkPermissions();
        if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") perm = await push.requestPermissions();
        if (perm.receive === "granted") await push.register();
      } catch (e) {
        console.warn("[push] registration skipped", e);
      }
    })();

    return () => {
      cancelled = true;
      listeners.forEach((l) => l.then((x) => x.remove()).catch(() => {}));
    };
  }, [router]);
  return null;
}
