# Dukaan Express

A multi-vendor instant-delivery marketplace. Admins onboard local shops, shop owners manage their own inventory and orders, and customers order from shops that deliver to their location. Shipping runs through Shiprocket and payments through Cashfree.

| Interface | URL | Who |
|---|---|---|
| Customer app (mobile-first) | `/` | Customers (email or mobile + password; email verified at signup) |
| Shop owner app (mobile-first) | `/shop` | Shop owners |
| Dealer portal (mobile-first) | `/dealer` | Regional dealers: onboard shops in their regions, approve those shops' payout requests, earn a share of platform commission |
| Super admin console | `/admin` | Platform admins |
| Delivery & shipment management | `/admin/shipments`, the order pages, `/shop/orders/:id` | Admins and shops |
| API docs (Swagger) | `/api-docs` | Developers |
| Android apps | [mobile/](mobile/README.md) — *Dukaan Express* (customers) and *Dukaan Partner* (shop owners) | Phones |

**Stack:** Next.js 16 (App Router, TypeScript) · Tailwind CSS 4 + shadcn/ui · PostgreSQL + Prisma 7 · JWT sessions (jose) · Cashfree · Shiprocket · Google Maps · Firebase Cloud Messaging · Cloudinary · Vitest.

## Documentation

- [Architecture, order state machine, Shiprocket workflow, folder structure, phase plan](docs/ARCHITECTURE.md)
- [Database design & ER diagram](docs/DATABASE.md)
- [REST API reference](docs/API.md) (interactive version at `/api-docs`)
- [Deploying to Azure Container Apps (free tier, private DB)](docs/AZURE.md)
- [Deployment & going live with each integration](docs/DEPLOYMENT.md)

## Local setup

**Prerequisites:** Node.js 20+ and PostgreSQL 14+.

```bash
npm install
```

```bash
cp .env.example .env
```

Edit `.env`. At minimum set `DATABASE_URL`, `TEST_DATABASE_URL` and a random `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Create the schema and load the demo data:

```bash
npx prisma migrate deploy
```

```bash
npm run db:seed
```

```bash
npm run dev
```

Open http://localhost:3000.

### Demo accounts (seed data, development only)

| Role | Login |
|---|---|
| Super admin | `admin@dukaanexpress.in` / `Admin@12345` at `/login/staff` |
| Shop owner (FreshMart + Sri Ganesh) | `ravi@dukaanexpress.in` / `Owner@12345` |
| Other shop owners | `anita@`, `suresh@`, `fatima@`, `manoj@dukaanexpress.in` / `Owner@12345` |
| Dealer (Bengaluru; Green Basket + Wellness Pharmacy) | `dealer@dukaanexpress.in` / `Dealer@12345` at `/login/staff` |
| Customers | `priya@example.com` (or `9876543210`) / `Customer@123` at `/login`. New customers sign up at `/signup`; with no SMTP configured the email code is shown on screen. |

The seed creates 7 Bengaluru shops (one awaiting approval), 9 categories, 60 products sold by several shops at different prices, coupons (`WELCOME50`, `SAVE10`, `FRESH20`), banners, and 30 days of order history for the analytics.

> Most seeded shops are open 06:00–23:30 IST; Wellness Pharmacy is open 24×7. Outside those hours, shops correctly show as "Closed now".

## Sandbox mode (no credentials needed)

Every third-party integration uses an isolated sandbox adapter until you add its credentials. The admin header lists the sandbox adapters that are active. Sandbox adapters never pretend to be the real provider: their ids are prefixed `MOCK-` / `order_MOCK`.

- **Payment sandbox:** without Cashfree keys, the checkout opens a sandbox dialog with "Simulate success" and "Simulate failure".
- **Shiprocket sandbox:** serviceability, order creation, AWB, pickup and label are simulated. A **"Simulate next courier update"** button on shop and admin order pages sends courier events through the *same webhook pipeline* Shiprocket uses, so you can follow an order all the way to Delivered.
  - Delivery pincode ending in `999`: no courier available, so you can exercise the shipment-exception and retry flow.
  - Delivery pincode ending in `998`: the create call times out once, so you can exercise the idempotent reconciliation.
- **Maps:** haversine distance × 1.3 road factor.
- **Email:** verification and password-reset codes are logged and shown on screen (in production only when `OTP_SANDBOX_IN_PRODUCTION=true`).
- **SMS:** not used for login right now (SMS OTP login is switched off).
- **Storage:** images are saved to `public/uploads`.
- **FCM:** push is logged; in-app notifications and live updates (SSE) still work.

## End-to-end walkthrough

1. **Customer** (`/login`, `priya@example.com` / `Customer@123`): pick a location (Koramangala), add items, check out with COD or UPI.
2. **Shop owner** (`fatima@…` for the pharmacy): the new order arrives instantly with a sound. Then tap Accept Order → Start Preparing → Ready for Packing → Order Packed. The Shiprocket shipment is created automatically and the order becomes **Awaiting pickup**.
3. Click **Simulate next courier update** to move it through Rider assigned → Picked up → Out for delivery → Delivered. The customer's timeline updates live.
4. **Admin** (`/admin`): see the order, its shipment, payment and commission. Under *Commission & payouts*, handle payout requests (shop owners add a bank account and request their balance under *Earnings & payouts*; you transfer it and record the UTR and receipt) and download reports from *Reports*.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm test` | Unit + integration tests (uses `TEST_DATABASE_URL`, which is migrated and truncated) |
| `npm run typecheck` / `npm run lint` | Static checks |
| `npm run db:migrate` | Create a new migration (development) |
| `npm run db:deploy` | Apply migrations |
| `npm run db:seed` | Reset and load demo data. **This truncates all tables.** |
| `npm run db:studio` | Prisma Studio |
| `npm run setup:prod` | Production-safe setup: roles, default categories, admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD` (never deletes) |

## Tests

`npm test` runs 61 tests:

- **Unit:**
  - pricing engine: tax-inclusive and tax-exclusive GST, coupons and their caps, delivery fees, commission
  - order state machine and role permissions
  - Shiprocket status mapping and courier selection
  - geo and opening hours
  - CSV formula-injection escaping
  - upload magic-byte sniffing
  - phone and pincode validation
- **Integration (real Postgres):**
  - full COD lifecycle through to commission
  - prepaid order → shop rejection → refund
  - server-side price recomputation
  - concurrent-checkout oversell prevention
  - invalid and unauthorised transitions, and double-accept races
  - the single-shop cart rule
  - cancellation rules
  - the modification approval workflow
  - Shiprocket no-courier exception and retry
  - timeout reconciliation without duplicate shipments
  - webhook de-duplication
  - Cashfree webhook signatures
  - payment retry after failure
  - Email-code verification, signup, login and password-reset protection
  - staff login status checks
  - JWT tampering

## Security highlights

- **Server-side money:** prices, discounts, stock, totals and payment status are always recomputed or verified on the server. Stock is reserved with conditional atomic updates.
- **Role checks in three layers:** the route proxy, every API handler, and the services, which scope data by ownership.
- **Passwords and codes:** passwords use bcrypt (cost 12). Email verification and reset codes are stored hashed, expire after 10 minutes, are single-use, and are limited by attempts and send rate. Signup needs a short-lived signed proof that the email was verified.
- **Sessions:** httpOnly SameSite cookies; deactivating a user or resetting a password revokes all their sessions.
- **Input checks:** zod validation on every endpoint, uploads checked by magic bytes, and spreadsheet-injection-safe CSV exports.
- **Webhooks:** Cashfree webhooks are HMAC-verified; Shiprocket webhooks are checked by token. Every inbound event is recorded and de-duplicated.
- **Idempotency:** order placement takes an idempotency key; Shiprocket order creation is reconciled on retry so it is never duplicated.
- **Audit trail:** admin and shop changes and every order transition are logged.

## Dealers

Admins create dealers in **Admin → Dealers** and give each one or more regions (service areas). Each region has at most one dealer.

- **Onboarding.** A dealer onboards shops at `/dealer/shops/new`. The address must fall in one of their regions: the pincode must be listed for the region, or, if the region has no pincodes, the city must match. The shop and the owner's login are created together, and the shop goes live immediately.
- **Payout approval.** When a shop with a dealer requests a payout, it starts in `DEALER_REVIEW`.
  - The dealer approves it, and it moves to `PENDING`, the admin's queue in Commission & payouts, marked "Approved by …".
  - Or the dealer declines it with a reason, and the orders go back to the shop's balance.
  - The admin can't pay a payout before the dealer approves it, but can decline it at any time.
- **Dealer earnings.** On each delivered order, the shop's dealer earns `commissionShareBps` of the platform commission, stored as `Commission.dealerAmount`. Dealers request this the same way shops do, and the admin pays it from Commission & payouts.
- **Reassigning.** Admins can change a shop's dealer on the shop page. Requests waiting for review move to the new dealer, or straight to the admin if the shop no longer has a dealer.
