import "server-only";
import { format } from "date-fns";
import { env } from "@/server/env";
import {
  ShiprocketError,
  type AwbResult,
  type CourierOption,
  type CreateOrderInput,
  type CreatedOrder,
  type PickupLocationInput,
  type ServiceabilityInput,
  type ShippingProvider,
  type TrackingResult,
} from "./types";

/**
 * Live Shiprocket adapter (https://apidocs.shiprocket.in).
 * Credentials never leave the server. Tokens are cached for 9 days (Shiprocket issues 10-day tokens)
 * and refreshed once on a 401.
 */
const TOKEN_TTL_MS = 9 * 24 * 3600 * 1000;
const TIMEOUT_MS = 15_000;

const g = globalThis as unknown as { __srToken?: { value: string; exp: number } };

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export class ShiprocketClient implements ShippingProvider {
  readonly name = "SHIPROCKET" as const;

  private get base() {
    return env().SHIPROCKET_BASE_URL.replace(/\/$/, "");
  }

  private async token(force = false): Promise<string> {
    if (!force && g.__srToken && g.__srToken.exp > Date.now()) return g.__srToken.value;
    const { SHIPROCKET_EMAIL, SHIPROCKET_PASSWORD } = env();
    const res = await fetch(`${this.base}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: SHIPROCKET_EMAIL, password: SHIPROCKET_PASSWORD }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => null)) as { token?: string; message?: string } | null;
    if (!res.ok || !body?.token) {
      throw new ShiprocketError(`Shiprocket authentication failed: ${body?.message ?? res.status}`, res.status, body, false);
    }
    g.__srToken = { value: body.token, exp: Date.now() + TOKEN_TTL_MS };
    return body.token;
  }

  /**
   * @param idempotent whether it is safe to retry on timeouts/5xx. Non-idempotent calls
   * (order creation) are never blindly retried — the orchestrator reconciles instead.
   */
  private async request<T>(
    method: "GET" | "POST",
    path: string,
    opts: { body?: unknown; query?: Record<string, string | number>; idempotent?: boolean } = {},
  ): Promise<T> {
    const maxAttempts = opts.idempotent === false ? 1 : 3;
    let lastErr: unknown;
    let refreshed = false;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const url = new URL(`${this.base}${path}`);
      for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, String(v));
      try {
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${await this.token()}` },
          body: opts.body ? JSON.stringify(opts.body) : undefined,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        const text = await res.text();
        let body: unknown = null;
        try {
          body = text ? JSON.parse(text) : null;
        } catch {
          body = text;
        }
        if (res.status === 401 && !refreshed) {
          refreshed = true;
          await this.token(true);
          attempt--;
          continue;
        }
        if (!res.ok) {
          const msg =
            (body as { message?: string } | null)?.message ?? `Shiprocket ${method} ${path} failed (${res.status})`;
          const retryable = res.status >= 500 || res.status === 429;
          throw new ShiprocketError(msg, res.status, body, retryable);
        }
        return body as T;
      } catch (e) {
        lastErr = e;
        const retryable =
          e instanceof ShiprocketError ? e.retryable : e instanceof Error && /timeout|fetch failed|ECONN/i.test(e.message);
        if (!retryable || attempt === maxAttempts) break;
        await sleep(400 * 2 ** (attempt - 1));
      }
    }
    if (lastErr instanceof ShiprocketError) throw lastErr;
    throw new ShiprocketError(
      lastErr instanceof Error ? `Shiprocket unreachable: ${lastErr.message}` : "Shiprocket unreachable",
      null,
      null,
      true,
    );
  }

  async checkServiceability(input: ServiceabilityInput): Promise<CourierOption[]> {
    type Resp = {
      data?: {
        available_courier_companies?: {
          courier_company_id: number;
          courier_name: string;
          rate: number;
          etd?: string;
          etd_hours?: number;
          rating?: number;
          is_surface?: boolean;
        }[];
        recommended_courier_company_id?: number;
      };
    };
    const query: Record<string, string | number> = {
      pickup_postcode: input.pickupPincode,
      delivery_postcode: input.deliveryPincode,
      weight: input.weightKg,
      cod: input.cod ? 1 : 0,
      declared_value: Math.round(input.declaredValue),
    };
    if (input.pickupLat != null && input.deliveryLat != null) {
      query.lat_from = input.pickupLat;
      query.long_from = input.pickupLng!;
      query.lat_to = input.deliveryLat;
      query.long_to = input.deliveryLng!;
    }
    const body = await this.request<Resp>("GET", "/courier/serviceability/", { query });
    const rec = body.data?.recommended_courier_company_id;
    return (body.data?.available_courier_companies ?? []).map((c) => ({
      courierCompanyId: c.courier_company_id,
      courierName: c.courier_name,
      rate: Math.round((c.rate ?? 0) * 100),
      etd: c.etd ?? null,
      etdHours: c.etd_hours ?? null,
      rating: c.rating ?? null,
      isSurface: !!c.is_surface,
      recommended: c.courier_company_id === rec,
    }));
  }

  async findOrderByChannelId(channelOrderId: string) {
    type Resp = { data?: { id: number; channel_order_id: string; shipments?: { id: number; awb?: string }[] }[] };
    const body = await this.request<Resp>("GET", "/orders", { query: { search: channelOrderId, per_page: 10 } });
    const match = body.data?.find((o) => o.channel_order_id === channelOrderId);
    if (!match) return null;
    const shipment = match.shipments?.[0];
    if (!shipment) return null;
    return { shiprocketOrderId: String(match.id), shipmentId: String(shipment.id), awbCode: shipment.awb || null };
  }

  async createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
    const [first, ...rest] = input.customer.name.trim().split(/\s+/);
    const payload = {
      order_id: input.channelOrderId,
      order_date: format(input.orderDate, "yyyy-MM-dd HH:mm"),
      pickup_location: input.pickupLocation,
      ...(env().SHIPROCKET_CHANNEL_ID ? { channel_id: env().SHIPROCKET_CHANNEL_ID } : {}),
      billing_customer_name: first,
      billing_last_name: rest.join(" ") || ".",
      billing_address: input.address.line1,
      billing_address_2: input.address.line2 ?? "",
      billing_city: input.address.city,
      billing_pincode: input.address.pincode,
      billing_state: input.address.state,
      billing_country: "India",
      billing_email: input.customer.email || "orders@dukaanexpress.in",
      billing_phone: input.customer.phone,
      shipping_is_billing: true,
      order_items: input.items.map((i) => ({
        name: i.name,
        sku: i.sku,
        units: i.units,
        selling_price: i.sellingPrice,
        discount: 0,
        tax: i.tax ?? 0,
      })),
      payment_method: input.paymentMethod,
      sub_total: input.subTotal,
      length: input.dimensions.lengthCm,
      breadth: input.dimensions.breadthCm,
      height: input.dimensions.heightCm,
      weight: input.dimensions.weightKg,
    };
    type Resp = { order_id?: number; shipment_id?: number; status?: string; message?: string };
    const body = await this.request<Resp>("POST", "/orders/create/adhoc", { body: payload, idempotent: false });
    if (!body.order_id || !body.shipment_id) {
      throw new ShiprocketError(body.message ?? "Shiprocket did not return an order/shipment id", 200, body, false);
    }
    return { shiprocketOrderId: String(body.order_id), shipmentId: String(body.shipment_id) };
  }

  async assignAwb(shipmentId: string, courierCompanyId: number): Promise<AwbResult> {
    type Resp = {
      awb_assign_status?: number;
      message?: string;
      response?: { data?: { awb_code?: string; courier_company_id?: number; courier_name?: string; awb_assign_error?: string } };
    };
    const body = await this.request<Resp>("POST", "/courier/assign/awb", {
      body: { shipment_id: Number(shipmentId), courier_id: courierCompanyId },
    });
    const d = body.response?.data;
    if (body.awb_assign_status !== 1 || !d?.awb_code) {
      throw new ShiprocketError(d?.awb_assign_error ?? body.message ?? "AWB assignment failed", 200, body, false);
    }
    return {
      awbCode: d.awb_code,
      courierCompanyId: d.courier_company_id ?? courierCompanyId,
      courierName: d.courier_name ?? "Courier",
    };
  }

  async schedulePickup(shipmentId: string) {
    type Resp = { pickup_status?: number; response?: { pickup_scheduled_date?: string; pickup_token_number?: string } };
    const body = await this.request<Resp>("POST", "/courier/generate/pickup", {
      body: { shipment_id: [Number(shipmentId)] },
    });
    const r = body.response;
    return {
      scheduledAt: r?.pickup_scheduled_date ? new Date(r.pickup_scheduled_date) : null,
      token: r?.pickup_token_number ?? null,
    };
  }

  async generateLabel(shipmentId: string) {
    type Resp = { label_created?: number; label_url?: string };
    const body = await this.request<Resp>("POST", "/courier/generate/label", {
      body: { shipment_id: [Number(shipmentId)] },
    });
    return { labelUrl: body.label_url ?? null };
  }

  async track(awbCode: string): Promise<TrackingResult> {
    type Resp = {
      tracking_data?: {
        track_url?: string;
        etd?: string;
        shipment_track?: { current_status?: string }[];
        shipment_track_activities?: { date: string; activity: string; location?: string; "sr-status-label"?: string }[];
      };
    };
    const body = await this.request<Resp>("GET", `/courier/track/awb/${encodeURIComponent(awbCode)}`);
    const t = body.tracking_data;
    return {
      currentStatus: t?.shipment_track?.[0]?.current_status ?? "UNKNOWN",
      etd: t?.etd ?? null,
      trackUrl: t?.track_url ?? null,
      activities: (t?.shipment_track_activities ?? []).map((a) => ({
        occurredAt: new Date(a.date),
        status: a["sr-status-label"] ?? a.activity,
        activity: a.activity,
        location: a.location ?? null,
      })),
    };
  }

  async cancelOrder(shiprocketOrderId: string) {
    await this.request("POST", "/orders/cancel", { body: { ids: [Number(shiprocketOrderId)] } });
  }

  async addPickupLocation(input: PickupLocationInput) {
    await this.request("POST", "/settings/company/addpickup", {
      body: {
        pickup_location: input.nickname,
        name: input.name,
        email: input.email,
        phone: input.phone,
        address: input.address,
        address_2: input.address2 ?? "",
        city: input.city,
        state: input.state,
        country: "India",
        pin_code: input.pincode,
        ...(input.lat != null ? { lat: input.lat, long: input.lng } : {}),
      },
    });
    return { nickname: input.nickname };
  }
}
