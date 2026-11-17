# Deployment guide

The app is a single Next.js 16 project (UI + REST API) backed by PostgreSQL. Recommended production setup:

| Component | Recommendation |
|---|---|
| App | **Vercel** (Node.js runtime). Any Node 20+ host also works (`npm run build && npm start`). |
| Database | Managed PostgreSQL 15+ — Neon, Supabase, AWS RDS, or Railway. Use a pooled connection string. |
| Images | Cloudinary (set the three `CLOUDINARY_*` vars). Local-disk storage is for development only. |
| Cron | Vercel Cron (configured in `vercel.json`) or any scheduler calling `GET /api/v1/cron/maintenance` with `Authorization: Bearer $CRON_SECRET` every 5 min. |
| Realtime | SSE works out of the box. For many instances, swap `src/server/realtime/bus.ts` for Redis pub/sub (the SSE route already polls the DB as a cross-instance fallback). |
| Rate limiting | In-memory per instance. For multi-instance production, back `src/server/rate-limit.ts` with Upstash Redis. |

## 1. Database

```bash
DATABASE_URL="postgresql://…" npx prisma migrate deploy
DATABASE_URL="postgresql://…" npm run db:seed   # optional demo data — do NOT run on a live database
```

## 2. Vercel

1. Import the GitHub repo into Vercel.
2. Build command: `npm run build` (runs `prisma generate` first). Install command: `npm install`.
3. Add environment variables from `.env.example` (Production + Preview). At minimum: `DATABASE_URL`, `APP_URL`, `JWT_SECRET`, `CRON_SECRET`.
4. Deploy. Vercel picks up the cron in `vercel.json`.

## 3. Integrations — going live

Each integration switches from its sandbox adapter to live automatically once its credentials are present. The admin header and **Settings → Integrations** show which are live.

### Cashfree
1. Dashboard → Developers → API Keys → `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`. Use test keys with `CASHFREE_ENV=sandbox`; live keys with `CASHFREE_ENV=production`.
2. Dashboard → Developers → Webhooks → add `https://<domain>/api/v1/webhooks/cashfree` (webhook version 2025-01-01) for **Payment** (success, failed, user dropped) and **Refund** events. Signatures use your secret key, so there is no separate webhook secret. Each order also sends this URL as `notify_url` when `APP_URL` is https.
3. Whitelist your domain in Cashfree (Developers → Whitelisting) before production; checkout from un-whitelisted domains is blocked.
4. Payments are never confirmed from the browser: after checkout the server re-reads the order and its payments from Cashfree and checks the amount. Webhooks reach the same result independently.

### Deliveries and riders
No courier account is needed. Set each shop's delivery mode, add riders (Dealer → Riders or Admin → Riders), and give riders the **Dukaan Rider** app (`mobile/rider`). For job alerts on riders' phones, add an Android app `in.dukaanexpress.rider` to the same Firebase project and put its `google-services.json` in `mobile/rider/android/app/` before building.

### Maps (free by default)
- **Address from GPS:** OpenStreetMap Nominatim — no key, free (max 1 request/second; results cached for a day).
- **Road distances:** set `ORS_API_KEY` from [openrouteservice.org](https://openrouteservice.org/dev/#/signup) (free plan: 500 matrix requests/day, no card). Without it, distances are straight-line × 1.3.
- **Customer live map:** OpenStreetMap tiles via Leaflet, no key.
- Optional paid upgrade: `GOOGLE_MAPS_API_KEY` (Distance Matrix + Geocoding) replaces both.

### Firebase Cloud Messaging
Create a service account with the *Firebase Cloud Messaging API* role → `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` (keep `\n` escapes). Web clients register tokens via `POST /api/v1/devices`. In-app notifications and SSE work without FCM.

### Email (SMTP)
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, optional `EMAIL_FROM`. Sends signup verification and password-reset codes. Works with a Gmail App Password (`smtp.gmail.com`), Brevo (`smtp-relay.brevo.com`) or any SMTP service. Without it, codes are logged and shown on screen only when `NODE_ENV !== "production"` or `OTP_SANDBOX_IN_PRODUCTION=true`.

### SMS (OTP, currently unused: SMS login is switched off)
`SMS_PROVIDER=msg91`, `SMS_API_KEY`, `SMS_TEMPLATE_ID` (DLT-approved template). Without it, OTPs are printed to the server log and shown on the login screen **only when `NODE_ENV !== "production"`**.

## 4. Security checklist

- [ ] `JWT_SECRET` and `CRON_SECRET` are long random values, unique per environment.
- [ ] Change all seeded passwords (or never seed production).
- [ ] `APP_URL` uses https; cookies are `Secure` automatically in production.
- [ ] Cashfree webhook URL configured (unsigned webhooks are rejected).
- [ ] Database user has least privilege; backups enabled.
- [ ] Rate limiter backed by Redis if running more than one instance.
