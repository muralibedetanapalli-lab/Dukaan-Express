import "server-only";
import { z } from "zod";
import { zAddress } from "./validators";
import { zBanner, zCoupon, zServiceArea } from "./validators-admin";
import { zCategoryInput, zOwnerInput, zShopInput, zSubcategoryInput } from "./services/admin";
import { zInventoryInput, zInventoryPatch } from "./services/inventory";
import { zLocation } from "./services/location";

type Method = "get" | "post" | "patch" | "delete";
interface Ep {
  m: Method;
  p: string;
  tag: string;
  s: string;
  roles?: string;
  body?: z.ZodType;
  query?: string[];
  binary?: string;
}

const phone = z.object({ phone: z.string().describe("10-digit Indian mobile") });

const E: Ep[] = [
  // Auth
  { m: "post", p: "/auth/otp/request", tag: "Authentication", s: "Request a login OTP (customers)", body: phone },
  { m: "post", p: "/auth/otp/verify", tag: "Authentication", s: "Verify OTP, create account if new, set session cookie", body: phone.extend({ otp: z.string(), name: z.string().optional(), email: z.string().optional() }) },
  { m: "post", p: "/auth/staff/login", tag: "Authentication", s: "Admin / shop-owner email + password login", body: z.object({ email: z.string(), password: z.string() }) },
  { m: "post", p: "/auth/logout", tag: "Authentication", s: "Clear the session" },
  { m: "get", p: "/auth/me", tag: "Authentication", s: "Current user" },
  { m: "patch", p: "/auth/me", tag: "Authentication", s: "Update own profile", roles: "any" },
  { m: "post", p: "/auth/password", tag: "Authentication", s: "Change own password (staff)", roles: "SUPER_ADMIN, SHOP_OWNER" },
  // Location & catalog
  { m: "post", p: "/location", tag: "Catalog", s: "Set browsing location (cookie) and check serviceability", body: zLocation },
  { m: "get", p: "/location/reverse", tag: "Catalog", s: "Reverse geocode a point", query: ["lat", "lng"] },
  { m: "get", p: "/catalog/home", tag: "Catalog", s: "Home feed: categories, banners, nearby shops, popular, deals, recent, recommended" },
  { m: "get", p: "/catalog/products", tag: "Catalog", s: "Browse/search products from shops delivering to the location", query: ["q", "categoryId", "subcategoryId", "shopId", "sort", "page", "pageSize"] },
  { m: "get", p: "/catalog/products/{slug}", tag: "Catalog", s: "Product detail with per-shop offers (price, stock, ETA)" },
  { m: "get", p: "/catalog/shops", tag: "Catalog", s: "Shops delivering to the location" },
  { m: "get", p: "/catalog/shops/{slug}", tag: "Catalog", s: "Shop storefront" },
  { m: "get", p: "/catalog/categories", tag: "Catalog", s: "Active categories with subcategories" },
  // Customer
  { m: "get", p: "/cart", tag: "Cart", s: "Cart with server-computed quote", roles: "CUSTOMER" },
  { m: "post", p: "/cart", tag: "Cart", s: "Add item (409 CART_SHOP_CONFLICT if another shop; pass replaceCart)", roles: "CUSTOMER", body: z.object({ inventoryId: z.string(), quantity: z.number(), replaceCart: z.boolean().optional() }) },
  { m: "patch", p: "/cart", tag: "Cart", s: "Set quantity or apply/remove coupon", roles: "CUSTOMER" },
  { m: "delete", p: "/cart", tag: "Cart", s: "Clear cart", roles: "CUSTOMER" },
  { m: "get", p: "/coupons", tag: "Cart", s: "Available coupons", query: ["shopId"] },
  { m: "get", p: "/customer/addresses", tag: "Customers", s: "Saved addresses", roles: "CUSTOMER" },
  { m: "post", p: "/customer/addresses", tag: "Customers", s: "Add address", roles: "CUSTOMER", body: zAddress },
  { m: "patch", p: "/customer/addresses/{id}", tag: "Customers", s: "Update address", roles: "CUSTOMER" },
  { m: "delete", p: "/customer/addresses/{id}", tag: "Customers", s: "Delete address (soft)", roles: "CUSTOMER" },
  { m: "get", p: "/orders", tag: "Orders", s: "My orders", roles: "CUSTOMER" },
  { m: "post", p: "/orders", tag: "Orders", s: "Place order from cart (requires Idempotency-Key header)", roles: "CUSTOMER", body: z.object({ addressId: z.string(), paymentMethod: z.enum(["UPI", "CARD", "NETBANKING", "COD"]), notes: z.string().optional() }) },
  { m: "get", p: "/orders/{id}", tag: "Orders", s: "Order detail with timeline & tracking", roles: "CUSTOMER" },
  { m: "post", p: "/orders/{id}/cancel", tag: "Orders", s: "Cancel (per cancellation rules)", roles: "CUSTOMER", body: z.object({ reason: z.string() }) },
  { m: "post", p: "/orders/{id}/reorder", tag: "Orders", s: "Add past items back to cart", roles: "CUSTOMER" },
  { m: "post", p: "/orders/{id}/review", tag: "Orders", s: "Rate a delivered order", roles: "CUSTOMER" },
  { m: "post", p: "/orders/{id}/pay", tag: "Payments", s: "Create Razorpay order → checkout options", roles: "CUSTOMER" },
  { m: "post", p: "/payments/verify", tag: "Payments", s: "Verify Razorpay signature and confirm payment", roles: "CUSTOMER" },
  { m: "get", p: "/support/tickets", tag: "Customers", s: "My support tickets", roles: "CUSTOMER" },
  { m: "post", p: "/support/tickets", tag: "Customers", s: "Raise a support ticket", roles: "CUSTOMER" },
  // Shop
  { m: "get", p: "/shop/me", tag: "Shop owner", s: "Active shop + owned shops", roles: "SHOP_OWNER" },
  { m: "patch", p: "/shop/me", tag: "Shop owner", s: "Toggle accepting orders, hours, prep time, switch shop", roles: "SHOP_OWNER" },
  { m: "get", p: "/shop/dashboard", tag: "Shop owner", s: "Shop dashboard stats", roles: "SHOP_OWNER" },
  { m: "get", p: "/shop/orders", tag: "Shop owner", s: "Shop orders by tab", roles: "SHOP_OWNER", query: ["tab", "status", "q", "page"] },
  { m: "get", p: "/shop/orders/{id}", tag: "Shop owner", s: "Order detail + allowed actions", roles: "SHOP_OWNER" },
  { m: "post", p: "/shop/orders/{id}/action", tag: "Shop owner", s: "accept | reject | start_preparing | ready_for_packing | packed (packed triggers Shiprocket)", roles: "SHOP_OWNER" },
  { m: "post", p: "/shop/orders/{id}/modification", tag: "Shop owner", s: "Request admin-approved quantity reduction", roles: "SHOP_OWNER" },
  { m: "get", p: "/shop/orders/{id}/shipment", tag: "Shiprocket", s: "Courier serviceability options", roles: "SHOP_OWNER" },
  { m: "post", p: "/shop/orders/{id}/shipment", tag: "Shiprocket", s: "retry | cancel | refresh | simulate (sandbox)", roles: "SHOP_OWNER" },
  { m: "get", p: "/shop/inventory", tag: "Inventory", s: "List inventory", roles: "SHOP_OWNER", query: ["search", "filter", "categoryId", "page"] },
  { m: "post", p: "/shop/inventory", tag: "Inventory", s: "Add product to inventory (link or create master product)", roles: "SHOP_OWNER", body: zInventoryInput },
  { m: "get", p: "/shop/inventory/{id}", tag: "Inventory", s: "Inventory item", roles: "SHOP_OWNER" },
  { m: "patch", p: "/shop/inventory/{id}", tag: "Inventory", s: "Update price / stock / availability", roles: "SHOP_OWNER", body: zInventoryPatch },
  { m: "delete", p: "/shop/inventory/{id}", tag: "Inventory", s: "Remove (soft delete)", roles: "SHOP_OWNER" },
  { m: "get", p: "/shop/products/search", tag: "Inventory", s: "Search global product master", roles: "SHOP_OWNER", query: ["q"] },
  { m: "get", p: "/shop/earnings", tag: "Shop owner", s: "Commissions and settlements", roles: "SHOP_OWNER" },
  // Admin
  { m: "get", p: "/admin/dashboard", tag: "Admin", s: "KPIs + sales series", roles: "SUPER_ADMIN", query: ["granularity"] },
  { m: "get", p: "/admin/shops", tag: "Admin · Shops", s: "List shops", roles: "SUPER_ADMIN", query: ["q", "approval", "active", "page"] },
  { m: "post", p: "/admin/shops", tag: "Admin · Shops", s: "Onboard shop", roles: "SUPER_ADMIN", body: zShopInput },
  { m: "get", p: "/admin/shops/{id}", tag: "Admin · Shops", s: "Shop detail + performance", roles: "SUPER_ADMIN" },
  { m: "patch", p: "/admin/shops/{id}", tag: "Admin · Shops", s: "Edit shop", roles: "SUPER_ADMIN" },
  { m: "post", p: "/admin/shops/{id}/actions", tag: "Admin · Shops", s: "approve | reject | activate | deactivate | assign_owner", roles: "SUPER_ADMIN" },
  { m: "get", p: "/admin/owners", tag: "Admin · Shops", s: "Shop owners", roles: "SUPER_ADMIN" },
  { m: "post", p: "/admin/owners", tag: "Admin · Shops", s: "Create shop owner", roles: "SUPER_ADMIN", body: zOwnerInput },
  { m: "patch", p: "/admin/owners/{userId}", tag: "Admin · Shops", s: "Edit / activate / deactivate owner", roles: "SUPER_ADMIN" },
  { m: "post", p: "/admin/owners/{userId}", tag: "Admin · Shops", s: "reset_password", roles: "SUPER_ADMIN" },
  { m: "get", p: "/admin/categories", tag: "Admin · Catalog", s: "Categories", roles: "SUPER_ADMIN" },
  { m: "post", p: "/admin/categories", tag: "Admin · Catalog", s: "Create category", roles: "SUPER_ADMIN", body: zCategoryInput },
  { m: "patch", p: "/admin/categories/{id}", tag: "Admin · Catalog", s: "Edit category", roles: "SUPER_ADMIN" },
  { m: "delete", p: "/admin/categories/{id}", tag: "Admin · Catalog", s: "Delete empty category", roles: "SUPER_ADMIN" },
  { m: "post", p: "/admin/subcategories", tag: "Admin · Catalog", s: "Create subcategory", roles: "SUPER_ADMIN", body: zSubcategoryInput },
  { m: "patch", p: "/admin/subcategories/{id}", tag: "Admin · Catalog", s: "Edit subcategory", roles: "SUPER_ADMIN" },
  { m: "get", p: "/admin/products", tag: "Admin · Catalog", s: "All products with per-shop inventory", roles: "SUPER_ADMIN", query: ["q", "categoryId", "shopId", "approval", "page"] },
  { m: "patch", p: "/admin/products/{id}", tag: "Admin · Catalog", s: "Moderate / recategorise product", roles: "SUPER_ADMIN" },
  { m: "get", p: "/admin/attributes", tag: "Admin · Catalog", s: "Global product attributes", roles: "SUPER_ADMIN" },
  { m: "post", p: "/admin/attributes", tag: "Admin · Catalog", s: "Upsert attribute", roles: "SUPER_ADMIN" },
  { m: "get", p: "/admin/orders", tag: "Admin · Orders", s: "All orders with filters", roles: "SUPER_ADMIN", query: ["status", "shopId", "customer", "q", "paymentStatus", "from", "to", "page"] },
  { m: "get", p: "/admin/orders/{id}", tag: "Admin · Orders", s: "Order detail", roles: "SUPER_ADMIN" },
  { m: "post", p: "/admin/orders/{id}/action", tag: "Admin · Orders", s: "transition | cancel | refund | shipment_create | shipment_cancel | shipment_refresh | shipment_couriers | simulate_courier", roles: "SUPER_ADMIN" },
  { m: "post", p: "/admin/modifications/{id}", tag: "Admin · Orders", s: "Approve / reject order modification", roles: "SUPER_ADMIN" },
  { m: "get", p: "/admin/customers", tag: "Admin · Customers", s: "Customers", roles: "SUPER_ADMIN" },
  { m: "get", p: "/admin/customers/{id}", tag: "Admin · Customers", s: "Customer detail + order history", roles: "SUPER_ADMIN" },
  { m: "patch", p: "/admin/customers/{id}", tag: "Admin · Customers", s: "Activate / deactivate", roles: "SUPER_ADMIN" },
  { m: "get", p: "/admin/tickets", tag: "Admin · Customers", s: "Support tickets", roles: "SUPER_ADMIN" },
  { m: "patch", p: "/admin/tickets/{id}", tag: "Admin · Customers", s: "Update ticket", roles: "SUPER_ADMIN" },
  { m: "get", p: "/admin/shipments", tag: "Shiprocket", s: "All shipments", roles: "SUPER_ADMIN", query: ["status", "q", "failedOnly", "page"] },
  { m: "get", p: "/admin/settlements", tag: "Admin · Finance", s: "Settlements + unsettled balances", roles: "SUPER_ADMIN" },
  { m: "post", p: "/admin/settlements", tag: "Admin · Finance", s: "Generate settlement for a period", roles: "SUPER_ADMIN" },
  { m: "post", p: "/admin/settlements/{id}", tag: "Admin · Finance", s: "Mark settlement paid", roles: "SUPER_ADMIN" },
  { m: "get", p: "/admin/reports", tag: "Reports", s: "Report preview (json) or download (csv | xlsx | pdf)", roles: "SUPER_ADMIN", query: ["type", "format", "from", "to", "shopId"], binary: "text/csv, xlsx, application/pdf" },
  { m: "get", p: "/admin/settings", tag: "Settings", s: "All platform settings", roles: "SUPER_ADMIN" },
  { m: "patch", p: "/admin/settings", tag: "Settings", s: "Update a settings group", roles: "SUPER_ADMIN" },
  { m: "get", p: "/admin/coupons", tag: "Settings", s: "Coupons", roles: "SUPER_ADMIN" },
  { m: "post", p: "/admin/coupons", tag: "Settings", s: "Create coupon", roles: "SUPER_ADMIN", body: zCoupon },
  { m: "patch", p: "/admin/coupons/{id}", tag: "Settings", s: "Edit coupon", roles: "SUPER_ADMIN" },
  { m: "get", p: "/admin/banners", tag: "Settings", s: "Banners", roles: "SUPER_ADMIN" },
  { m: "post", p: "/admin/banners", tag: "Settings", s: "Create banner", roles: "SUPER_ADMIN", body: zBanner },
  { m: "get", p: "/admin/service-areas", tag: "Settings", s: "Service areas", roles: "SUPER_ADMIN" },
  { m: "post", p: "/admin/service-areas", tag: "Settings", s: "Create service area", roles: "SUPER_ADMIN", body: zServiceArea },
  { m: "get", p: "/admin/audit-logs", tag: "Admin", s: "Audit log", roles: "SUPER_ADMIN" },
  { m: "get", p: "/admin/webhooks", tag: "Admin", s: "Webhook event log", roles: "SUPER_ADMIN" },
  // Platform
  { m: "post", p: "/uploads", tag: "Platform", s: "Upload image (multipart: file, folder)", roles: "SUPER_ADMIN, SHOP_OWNER" },
  { m: "get", p: "/notifications", tag: "Notifications", s: "My notifications", roles: "any" },
  { m: "post", p: "/notifications", tag: "Notifications", s: "Mark read", roles: "any" },
  { m: "post", p: "/devices", tag: "Notifications", s: "Register FCM token", roles: "any" },
  { m: "get", p: "/realtime", tag: "Notifications", s: "Server-Sent Events stream", roles: "any" },
  { m: "post", p: "/webhooks/razorpay", tag: "Webhooks", s: "Razorpay webhook (X-Razorpay-Signature HMAC)" },
  { m: "post", p: "/webhooks/shiprocket", tag: "Webhooks", s: "Shiprocket tracking webhook (x-api-key token)" },
  { m: "get", p: "/cron/maintenance", tag: "Platform", s: "Maintenance job (Bearer CRON_SECRET)" },
  { m: "get", p: "/health", tag: "Platform", s: "Health + integration modes" },
];

function schemaOf(t: z.ZodType) {
  try {
    return z.toJSONSchema(t, { io: "input", unrepresentable: "any" });
  } catch {
    return { type: "object" };
  }
}

export function openApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const e of E) {
    const params = [
      ...[...e.p.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: "path", required: true, schema: { type: "string" } })),
      ...(e.query ?? []).map((q) => ({ name: q, in: "query", required: false, schema: { type: "string" } })),
      ...(e.p === "/orders" && e.m === "post" ? [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string" } }] : []),
    ];
    paths[e.p] ??= {};
    paths[e.p][e.m] = {
      tags: [e.tag],
      summary: e.s,
      description: e.roles ? `**Roles:** ${e.roles}` : "Public",
      ...(e.roles ? { security: [{ session: [] }] } : {}),
      ...(params.length ? { parameters: params } : {}),
      ...(e.body ? { requestBody: { required: true, content: { "application/json": { schema: schemaOf(e.body) } } } } : {}),
      responses: {
        "200": {
          description: "Success — `{ data: … }`",
          content: e.binary ? { "application/octet-stream": {} } : { "application/json": { schema: { type: "object", properties: { data: {} } } } },
        },
        "400": { $ref: "#/components/responses/Error" },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "409": { $ref: "#/components/responses/Error" },
        "422": { $ref: "#/components/responses/Error" },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Dukaan Express API",
      version: "1.0.0",
      description:
        "Multi-vendor instant-delivery marketplace. All amounts are integer **paise**. Authentication uses an httpOnly session cookie (`dx_session`) issued by the auth endpoints. Errors: `{ error: { code, message, details } }`.",
    },
    servers: [{ url: "/api/v1" }],
    components: {
      securitySchemes: { session: { type: "apiKey", in: "cookie", name: "dx_session" } },
      responses: {
        Error: {
          description: "Error",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" }, details: {} } } },
              },
            },
          },
        },
      },
    },
    paths,
  };
}
