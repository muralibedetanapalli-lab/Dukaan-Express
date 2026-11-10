# Dukaan Express Android apps

Two Capacitor apps that load the live website and add native features:

| App | Package | Opens | Native extras |
|---|---|---|---|
| **Dukaan Express** (customers) | `in.dukaanexpress.customer` | `/` | GPS location, push notifications |
| **Dukaan Partner** (shop owners) | `in.dukaanexpress.shop` | `/shop` | Camera/gallery for product photos, loud "new order" push channel |

Both have a splash screen that covers Azure's scale-to-zero cold start, an offline screen with *Try again*, Android back-button navigation, and edge-to-edge layout. **Most changes ship by deploying the website** — rebuild the apps only for native changes (icons, permissions, plugins, version bumps).

> Package names are permanent once uploaded to Google Play. Change `appId` in `customer/capacitor.config.ts` / `shop/capacitor.config.ts` (and `namespace`/`applicationId` in `android/app/build.gradle`) *before* the first upload if you want different ones.

## Prerequisites

Android Studio (provides JDK 21 and the Android SDK) and Node.js 20+.

```bash
cd mobile
npm install
```

## Build

```bash
node scripts/make-keystore.mjs
```

Creates the release (upload) key once in `~/.dukaan-keys/` (outside the repo) and wires it into both projects. **Back up `~/.dukaan-keys`.**

```bash
npm run build
```

Outputs to `mobile/dist/`:
- `dukaan-<app>-<version>.apk` — install directly on phones for testing
- `dukaan-<app>-<version>.aab` — upload to Google Play

For a new release bump the version (Play requires a higher `VERSION_CODE` each upload):

```bash
VERSION_NAME=1.0.1 VERSION_CODE=2 npm run build
```

Other useful commands:

| Command | Purpose |
|---|---|
| `npm run assets` | Re-render icons & splash from `scripts/make-assets.mjs`, then run `npm run assets -w customer` / `-w shop` |
| `DUKAAN_URL=http://10.0.2.2:3000 npm run sync` | Point an emulator build at your local `npm run dev` server |
| `npx cap open android` (inside `customer/` or `shop/`) | Open the project in Android Studio |

## Install on a phone for testing

Copy the `.apk` to the phone and open it (allow "install unknown apps" when asked), or with USB debugging on:

```bash
adb install -r dist/dukaan-customer-1.0.0.apk
```

## Turn on push notifications (free — Firebase Cloud Messaging)

1. [Firebase console](https://console.firebase.google.com) → *Add project* (Analytics not needed).
2. *Add app → Android* twice: package `in.dukaanexpress.customer` and `in.dukaanexpress.shop`. Download each `google-services.json` into
   `customer/android/app/` and `shop/android/app/` (git-ignored).
3. Rebuild (`npm run build`). The apps detect the file and enable push automatically (`push=1` in their user agent).
4. Server side: Firebase → Project settings → *Service accounts* → *Generate new private key*. Add to the Azure app as secrets/env vars:
   `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` (see `docs/AZURE.md` § 8).

Shop owners then get a loud high-priority "New order" notification even when the app is closed; customers get order-status updates. Tapping a notification opens the matching order.

## Publish on Google Play

1. [Play Console](https://play.google.com/console) developer account — one-time US$25.
2. *Create app* for each app → upload the `.aab` to **Internal testing** first. Accept **Play App Signing** (Google holds the app signing key; yours is only the upload key, which Play can reset if lost).
3. Complete the store listing, content rating, target audience and **Data safety** form. The apps collect: phone number, name, email, approximate & precise location (customer app), photos (shop app), and purchase history — all for app functionality, transmitted over HTTPS.
4. Privacy policy URL is required — host one on the website (e.g. `/privacy`) before submitting.
5. New personal developer accounts must run a closed test with 12+ testers for 14 days before production access.

## How it works

- `app-config.ts` — shared Capacitor config (server URL, user agent marker, splash, offline page, Razorpay navigation).
- `scripts/write-www.mjs` — generates the local `www/` loader and offline pages.
- Website side: `src/components/shared/native-bridge.tsx` (splash hide, FCM token registration via `POST /api/v1/devices`, notification taps) and the `html[data-native]` safe-area rules in `src/app/globals.css`.
