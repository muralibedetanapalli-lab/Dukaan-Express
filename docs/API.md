# REST API

- Base URL: `/api/v1`
- Interactive docs (Swagger UI): **`/api-docs`** — OpenAPI 3.1 JSON at `/api/v1/openapi.json` (request bodies generated from the real zod validators).
- Auth: httpOnly session cookie `dx_session` (JWT, HS256) set by `/auth/otp/verify` (customers) or `/auth/staff/login` (admins, shop owners).
- Success envelope: `{ "data": … }` · Error envelope: `{ "error": { "code", "message", "details" } }`
- Money is always integer **paise**.

| Module | Endpoints |
|---|---|
| Authentication | `POST /auth/otp/request`, `POST /auth/otp/verify`, `POST /auth/staff/login`, `POST /auth/logout`, `GET/PATCH /auth/me`, `POST /auth/password` |
| Location | `POST /location`, `GET /location/reverse`, `GET /location/areas` |
| Catalog | `GET /catalog/home`, `GET /catalog/products`, `GET /catalog/products/:slug`, `GET /catalog/shops`, `GET /catalog/shops/:slug`, `GET /catalog/categories` |
| Cart | `GET/POST/PATCH/DELETE /cart`, `GET /coupons` |
| Customers | `GET/POST /customer/addresses`, `PATCH/DELETE /customer/addresses/:id`, `GET/POST /support/tickets` |
| Orders | `GET/POST /orders` (POST needs `Idempotency-Key`), `GET /orders/:id`, `POST /orders/:id/cancel`, `POST /orders/:id/reorder`, `POST /orders/:id/review` |
| Payments | `POST /orders/:id/pay`, `POST /payments/verify`, `POST /webhooks/razorpay` |
| Shop owner | `GET/PATCH /shop/me`, `GET /shop/dashboard`, `GET /shop/orders`, `GET /shop/orders/:id`, `POST /shop/orders/:id/action`, `POST /shop/orders/:id/modification`, `GET /shop/earnings` |
| Inventory | `GET/POST /shop/inventory`, `GET/PATCH/DELETE /shop/inventory/:id`, `GET /shop/products/search` |
| Shiprocket | `GET/POST /shop/orders/:id/shipment`, `GET /admin/shipments`, `POST /webhooks/shiprocket` (alias `/webhooks/courier`) |
| Admin | `GET /admin/dashboard`, shops, owners, categories, subcategories, products, attributes, orders (+ `/action`), modifications, customers, tickets, settlements, coupons, banners, service-areas, audit-logs, webhooks |
| Reports | `GET /admin/reports?type=&format=csv|xlsx|pdf|json&from=&to=&shopId=` |
| Settings | `GET/PATCH /admin/settings` |
| Notifications | `GET/POST /notifications`, `POST/DELETE /devices`, `GET /realtime` (SSE) |
| Platform | `POST /uploads`, `GET /health`, `GET /cron/maintenance` |

## Shop workflow actions

`POST /shop/orders/:id/action` with `{ "action": … }`:

| action | transition |
|---|---|
| `accept` | SHOP_PENDING → SHOP_ACCEPTED |
| `reject` (+`reason`) | SHOP_PENDING → SHOP_REJECTED (stock released, auto-refund if prepaid) |
| `start_preparing` | SHOP_ACCEPTED → PREPARING |
| `ready_for_packing` | PREPARING → READY_FOR_PACKING |
| `packed` | READY_FOR_PACKING → PACKED → SHIPMENT_CREATING → SHIPMENT_CREATED (or back to PACKED with a shipment exception) |

## Common error codes

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Request failed zod validation |
| `UNAUTHORIZED` / `FORBIDDEN` | 401 / 403 | Not signed in / wrong role |
| `CONFLICT` (+`details.reason=CART_SHOP_CONFLICT`) | 409 | Cart contains another shop's items |
| `INVALID_TRANSITION` | 409 | Order state machine refused the change |
| `OUT_OF_STOCK`, `SHOP_CLOSED`, `SHOP_NOT_SERVICEABLE`, `MIN_ORDER`, `COD_LIMIT`, `COUPON_INVALID` | 422 | Checkout rule violations |
| `NO_COURIER`, `COURIER_UNAVAILABLE`, `SHIPMENT_VALIDATION` | 422 | Shipment could not be created |
| `RATE_LIMITED` | 429 | Too many requests |
| `UPSTREAM_ERROR` | 502 | Razorpay / Shiprocket error |
