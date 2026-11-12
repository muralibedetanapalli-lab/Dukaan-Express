# Google Play listing — Dukaan Express & Dukaan Partner

Everything to copy into [Play Console](https://play.google.com/console), app by app. Graphics are in this folder:

| File | Play Console field | Spec |
|---|---|---|
| `<app>/icon-512.png` | Store listing → App icon | 512×512 PNG |
| `<app>/feature-graphic.png` | Store listing → Feature graphic | 1024×500 PNG |
| `<app>/screenshots/01…06-*.png` | Store listing → Phone screenshots | 1080×1920 (9:16), 6 each |
| `../dist/dukaan-<app>-1.0.0.aab` | Test and release → upload | signed with your upload key |

Re-render the graphics after design changes with `node scripts/make-store-assets.mjs` (from `mobile/`). The raw phone captures it uses are in `<app>/raw/`.

**Site links used below.** Replace the domain everywhere if you move to a custom domain. Play lets you edit these URLs at any time.

```
BASE = https://dukaan-app.bluesky-9c69274d.centralindia.azurecontainerapps.io
Privacy policy:   BASE/legal/privacy
Delete account:   BASE/legal/delete-account
Terms:            BASE/legal/terms
Website:          BASE
```

---

## Before you start (one-time)

1. **Developer account:** play.google.com/console → sign up (US$25).
   - Choose **Organization** if you have a registered business. It needs a D-U-N-S number (free, takes about 1–2 weeks).
   - A **Personal** account has to run a *closed test with at least 12 testers for 14 days in a row* before it can publish to production.
   - **Developer name:** your business or brand name. Play shows it right under the app name.
2. **Admin → Settings on the live site:**
   - **Platform:** set your real support email and phone. They still show the placeholders `support@dukaanexpress.in` and `1800-123-4567`, and the policy pages display them.
   - **Legal & business:** fill in business name, address, GSTIN and grievance officer.
   - Google reviewers open these pages.
3. **Real email codes:** set up SMTP before launch. Otherwise signup codes are shown on screen, and anyone can sign up with an email they don't own.

---

## App 1 — Dukaan Express (customers)

- **Package:** `in.dukaanexpress.customer`
- **Category:** Shopping
- **Tags:** Grocery delivery, Shopping, Online grocery
- **Free / paid:** Free. **Contains ads:** No. **In-app purchases:** No (physical goods paid via Cashfree don't count).

**App name** (30 max)
```
Dukaan Express
```

**Short description** (80 max — this is 77)
```
Groceries & daily essentials from local shops near you, delivered in minutes.
```

**Full description** (4000 max)
```
Dukaan Express brings your neighbourhood shops to your phone. Order groceries, fresh fruits and vegetables, dairy, staples, household essentials and more from trusted local stores near you, and get them delivered in minutes.

WHY DUKAAN EXPRESS
• Shop local: buy from real shops in your area, not a far-away warehouse
• Fast delivery: see the delivery time for each shop before you order
• Fair prices: prices are never above MRP, with clear offers on every item
• Pay your way: UPI, cards, net banking and wallets via Cashfree Payments, or cash on delivery where available
• Track every step: follow your order from the shop's counter to your door, with live status updates
• Easy help: raise an issue on any order in a tap; refunds go back to your original payment method

WHAT YOU CAN ORDER
Fruits & vegetables, milk, curd, paneer & dairy, atta, rice, dals & staples, oils & masalas, bakery, snacks & beverages, household & cleaning essentials, personal care, stationery and more — whatever your local shops stock.

HOW IT WORKS
1. Set your delivery location
2. Pick a shop near you and add items to your cart
3. Pay online or choose cash on delivery
4. The shop packs your order and it's on its way

SAFE AND PRIVATE
Your account is protected with a password and a verified email address. Payments are processed securely by Cashfree Payments — we never see your card number or UPI PIN. You can delete your account at any time from the app.

Questions? Write to us from the Help section of any order, or see our policies at https://dukaan-app.bluesky-9c69274d.centralindia.azurecontainerapps.io/legal
```

**Release notes** (first release)
```
Welcome to Dukaan Express! Order groceries and essentials from shops near you, pay online or cash on delivery, and track your order live.
```

---

## App 2 — Dukaan Partner (shop owners)

- **Package:** `in.dukaanexpress.shop`
- **Category:** Business
- **Tags:** Business, Shopping, Inventory management
- **Free / paid:** Free. **Contains ads:** No. **In-app purchases:** No.

**App name**
```
Dukaan Partner
```

**Short description** (70 characters)
```
Sell on Dukaan Express: take online orders, manage stock and get paid.
```

**Full description**
```
Dukaan Partner is the app for shops that sell on Dukaan Express. Take orders from customers in your area, keep your stock up to date and track your earnings — all from your phone.

NEVER MISS AN ORDER
• A loud "New order" alert the moment a customer orders, even when the app is closed
• Accept or reject in a tap, and see exactly what to pack
• Suggest a change if an item is unavailable — the customer approves it in the app
• Delivery is booked for you once the order is packed

MANAGE YOUR SHOP
• Add products with photos straight from your camera
• Update prices and stock in one tap; mark items unavailable instantly
• Set opening hours and preparation time
• Go online or offline whenever you like

GET PAID WHEN YOU WANT
• See your earnings after platform commission for every order
• Request a payout to your bank account any time
• Track every payout with its bank reference number

Dukaan Partner is for registered sellers on Dukaan Express. To start selling, contact the Dukaan Express team to get your shop approved.
```

**Release notes**
```
First release of Dukaan Partner: receive orders with loud alerts, manage your stock and track payouts.
```

---

## App content (Policy → App content) — answers for both apps

| Section | Answer |
|---|---|
| Privacy policy | `BASE/legal/privacy` |
| Ads | No, my app does not contain ads |
| App access | **All or some functionality is restricted** → add the reviewer login (see below) |
| Content rating | Questionnaire → category **"All other app types"**. Violence, sexuality, language, drugs, gambling: all **No**. "Users can interact / share content": **Yes** (customers post product reviews; you can remove them). "Shares user location with other users": **No**. "Purchase of digital goods": **No**. Expected rating: **Everyone / 3+** |
| Target audience | **18 and over** only (Terms require 18+). Not appealing to children: **No** |
| News app | No |
| COVID-19 contact tracing | No |
| Data safety | See tables below |
| Government app | No |
| Financial features | **None** of the listed (you only take payments for goods; Cashfree is the processor) |
| Health | Customer app: tick none, *unless* shops will sell prescription medicines — then you need Play's online pharmacy declaration and licences. Safer for launch: let shops list only over-the-counter items in the "Medicines" category |
| Account deletion | Yes, users can delete their account: in-app **Account → Delete account**, web link `BASE/legal/delete-account` |

### Reviewer login (App access)
- **Customer app:** reviewers can sign up themselves. Still, create a test customer on the live site and enter its email and password here. Instructions: *"Log in with the email and password below. Set any Bengaluru location to see shops."*
- **Partner app:** needs a real approved shop.
  - Create a **demo shop** in Admin → Shops on the live site, with owner email e.g. `playreview@<your domain>`, a strong password and a few products.
  - Give Google those credentials.
  - Keep that shop offline for customers if you don't want real orders, but the login must work.

### Data safety — Dukaan Express (customer)
Data is encrypted in transit: **Yes**. Users can request deletion: **Yes**. Independent security review: No.

| Data type | Collected | Shared | Required? | Purposes |
|---|---|---|---|---|
| Name | Yes | Yes (with the shop & delivery partner fulfilling the order) | Required | App functionality, Account management |
| Email address | Yes | No | Required | Account management, App functionality |
| Phone number | Yes | Yes (shop & delivery partner) | Required | App functionality, Account management |
| Address | Yes | Yes (shop & delivery partner) | Required | App functionality |
| Approximate location | Yes | No | Optional | App functionality |
| Precise location | Yes | No | Optional | App functionality |
| Purchase history | Yes | No | Required | App functionality, Analytics |
| Device or other IDs (push token) | Yes | No | Optional | App functionality |
| Payment info | **No** — card and UPI details go directly to Cashfree, which processes them | | | |

### Data safety — Dukaan Partner (shop)
Encrypted in transit: **Yes**. Deletion: **Yes** (by request — `BASE/legal/delete-account`).

| Data type | Collected | Shared | Required? | Purposes |
|---|---|---|---|---|
| Name | Yes | Yes (shown to customers on their orders) | Required | App functionality, Account management |
| Email address | Yes | No | Required | Account management |
| Phone number | Yes | Yes (customers & delivery partner) | Required | App functionality |
| Address (shop address) | Yes | Yes (customers & delivery partner) | Required | App functionality |
| Other financial info (bank account / UPI for payouts) | Yes | No | Required | App functionality |
| Photos (product photos) | Yes | Yes (shown publicly in the store) | Optional | App functionality |
| Purchase history (orders received) | Yes | No | Required | App functionality, Analytics |
| Device or other IDs (push token) | Yes | No | Optional | App functionality |

### Permissions you may be asked about
- **Customer:** `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION`, used only while the app is open to find shops near you (no background location, so no extra declaration).
- **Partner:** `CAMERA` to photograph products.
- **Both:** notifications (Android 13+ asks at runtime).

---

## Release steps (per app)

1. *Create app* → name, language **English (India)**, App, Free → accept the declarations.
2. Fill **Store listing** (text + graphics above) and **App content** (table above).
3. **Testing → Closed testing** (personal accounts) or **Internal testing**:
   - Create a track and add testers' Gmail addresses (personal accounts need 12+).
   - Upload `dist/dukaan-<app>-1.0.0.aab`.
   - Accept **Play App Signing**.
   - Roll out, then share the opt-in link with testers.
4. After the test period, go to **Production → Create release**, promote the same build, and **Send for review**. The first review usually takes a few days.
5. **Later updates.** Website changes go live without a new build. When a new build *is* needed (icons, permissions, plugins), bump the version:
   ```bash
   VERSION_NAME=1.0.1 VERSION_CODE=2 npm run build
   ```
