import { existsSync } from "node:fs";
import path from "node:path";
import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Shared Capacitor config for the Dukaan Express Android apps.
 * Both apps load the live website (server.url) and add native capabilities on top.
 *
 * DUKAAN_URL overrides the server, e.g. `DUKAAN_URL=http://10.0.2.2:3000` for an emulator against `npm run dev`.
 */
export const DEFAULT_SERVER = "https://dukaan-app.bluesky-9c69274d.centralindia.azurecontainerapps.io";

export function appConfig(opts: {
  dir: string;
  appId: string;
  appName: string;
  role: "customer" | "shop";
  startPath: string;
  splashColor: string;
}): CapacitorConfig {
  const server = (process.env.DUKAAN_URL ?? DEFAULT_SERVER).replace(/\/$/, "");
  // Push is switched on automatically once android/app/google-services.json (Firebase) is present.
  const push = existsSync(path.join(opts.dir, "android", "app", "google-services.json")) ? 1 : 0;
  return {
    appId: opts.appId,
    appName: opts.appName,
    webDir: "www",
    // The website reads this to know it runs inside the app (see src/components/shared/native-bridge.tsx).
    appendUserAgent: `DukaanApp/1.0 (${opts.role}; push=${push})`,
    server: {
      url: `${server}${opts.startPath}`,
      cleartext: server.startsWith("http://"),
      // Shown when the server can't be reached (offline / cold-start failure).
      errorPath: "offline.html",
      // Razorpay Checkout runs inside the app; everything else (tel:, upi:, other sites) opens externally.
      allowNavigation: ["*.razorpay.com"],
    },
    android: {
      backgroundColor: "#f7faf7",
      allowMixedContent: false,
      webContentsDebuggingEnabled: process.env.DUKAAN_DEBUG === "1",
    },
    plugins: {
      SplashScreen: {
        // Covers Azure scale-to-zero cold starts; the website hides it as soon as it is interactive.
        launchShowDuration: 20000,
        launchAutoHide: true,
        backgroundColor: opts.splashColor,
        showSpinner: true,
        androidSpinnerStyle: "small",
        spinnerColor: "#ffffff",
      },
      PushNotifications: {
        presentationOptions: ["badge", "sound", "alert"],
      },
    },
  };
}
