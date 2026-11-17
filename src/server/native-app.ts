import "server-only";
import { headers } from "next/headers";

/** Which Dukaan Android app (if any) is loading the page — from the user-agent marker set in mobile/app-config.ts. */
export async function nativeApp(): Promise<"customer" | "shop" | "rider" | null> {
  const ua = (await headers()).get("user-agent") ?? "";
  const m = ua.match(/DukaanApp\/[\d.]+ \((customer|shop|rider);/);
  return (m?.[1] as "customer" | "shop" | "rider" | undefined) ?? null;
}

/** Where the app's own logo / "back" links should go (never into another app's area). */
export function appHome(app: Awaited<ReturnType<typeof nativeApp>>) {
  return app === "rider" ? "/rider" : app === "shop" ? "/shop" : "/";
}
