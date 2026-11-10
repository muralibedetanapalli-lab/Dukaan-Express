import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Bike, ExternalLink, MapPin, PartyPopper, Phone, Store, Truck } from "lucide-react";
import { getSessionUser } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { getOrderForActor } from "@/server/services/order";
import { getSettings } from "@/server/services/settings";
import { Card } from "@/components/ui/card";
import { OrderStatusBadge, PaymentBadge, Pill } from "@/components/shared/status-badge";
import { OrderTimeline } from "@/components/shared/order-timeline";
import { RealtimeListener } from "@/components/shared/realtime";
import { ProductThumb } from "@/components/shared/misc";
import { BillSummary } from "@/components/customer/bill-summary";
import { formatINR } from "@/lib/money";
import { fmtDateTime } from "@/lib/format";
import { OrderActions } from "./order-actions";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ placed?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const user = await getSessionUser();
  if (!user?.customerId) redirect(`/login?next=/orders/${id}`);
  let order;
  try {
    order = await getOrderForActor(id, { id: user.id, role: "CUSTOMER", customerId: user.customerId });
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
  const settings = await getSettings();
  const addr = order.addressSnapshot as Record<string, string | null>;
  const s = order.shipment;
  const cancellable = settings.cancellation.customerCancellableStatuses.includes(order.status);

  return (
    <div className="mx-auto max-w-4xl">
      <RealtimeListener />
      {sp.placed && order.status !== "PAYMENT_PENDING" && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-lime-500 p-4 text-white">
          <PartyPopper className="size-8 shrink-0" />
          <div>
            <p className="font-bold">Order placed successfully!</p>
            <p className="text-sm text-white/90">
              {order.shop.name} will confirm it shortly. Estimated delivery in {order.etaMinutes} minutes.
            </p>
          </div>
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/orders" className="text-sm text-muted-foreground">
            ← My orders
          </Link>
          <h1 className="text-xl font-bold">Order {order.orderNumber}</h1>
          <p className="text-sm text-muted-foreground">Placed {fmtDateTime(order.placedAt)}</p>
        </div>
        <div className="flex items-center gap-2">
          <OrderStatusBadge status={order.status} />
          <PaymentBadge status={order.paymentStatus} method={order.paymentMethod} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <OrderActions
            orderId={order.id}
            status={order.status}
            cancellable={cancellable}
            needsPayment={order.status === "PAYMENT_PENDING"}
            canReview={order.status === "DELIVERED" && !order.review}
            supportPhone={settings.platform.supportPhone}
          />

          <Card className="p-5">
            <p className="mb-4 font-semibold">Order status</p>
            <OrderTimeline status={order.status} history={order.statusHistory} paymentMethod={order.paymentMethod} />
          </Card>

          {s && s.status !== "CANCELLED" && (
            <Card className="gap-3 p-5">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 font-semibold">
                  <Truck className="size-5 text-primary" /> Delivery tracking
                </p>
                {s.provider === "SHIPROCKET_MOCK" && <Pill tone="warning">Sandbox courier</Pill>}
              </div>
              <div className="grid gap-1 text-sm sm:grid-cols-2">
                {s.courierName && <p>Courier: <b>{s.courierName}</b></p>}
                {s.awbCode && <p>AWB: <span className="font-mono">{s.awbCode}</span></p>}
                {s.riderName && (
                  <p className="flex items-center gap-1">
                    <Bike className="size-4" /> {s.riderName}
                    {s.riderPhone && (
                      <a href={`tel:${s.riderPhone}`} className="ml-1 inline-flex items-center gap-0.5 text-primary">
                        <Phone className="size-3.5" /> Call
                      </a>
                    )}
                  </p>
                )}
                {s.etd && <p>ETA: {s.etd}</p>}
              </div>
              {s.trackingUrl && (
                <a href={s.trackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
                  Live tracking <ExternalLink className="size-3.5" />
                </a>
              )}
              {s.events.length > 0 && (
                <ul className="space-y-2 border-l-2 pl-4 text-sm">
                  {s.events.filter((e) => e.source !== "SYSTEM" || ["COURIER_ASSIGNED", "PICKUP_SCHEDULED"].includes(e.status)).map((e) => (
                    <li key={e.id}>
                      <p className="font-medium">{e.description ?? e.status}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmtDateTime(e.occurredAt)}
                        {e.location ? ` · ${e.location}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <Card className="gap-0 p-0">
            <p className="border-b px-5 py-3 font-semibold">Items ({order.items.length})</p>
            <ul className="divide-y">
              {order.items.map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-5 py-3">
                  <ProductThumb src={i.imageUrl} alt={i.productName} className="size-12 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{i.productName}</p>
                    <p className="text-xs text-muted-foreground">
                      {i.variantName ?? i.unitLabel} · {i.quantity} × {formatINR(i.unitPrice)}
                    </p>
                  </div>
                  <p className="text-sm font-semibold">{formatINR(i.lineTotal)}</p>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-4">
          <BillSummary quote={{ ...order, couponCode: order.couponCode }} title="Bill summary" />
          {order.refunds.length > 0 && (
            <Card className="gap-2 p-4 text-sm">
              <p className="font-semibold">Refunds</p>
              {order.refunds.map((r) => (
                <div key={r.id} className="flex justify-between">
                  <span>{r.reason}</span>
                  <span className="font-medium">
                    {formatINR(r.amount)} · {r.status.toLowerCase()}
                  </span>
                </div>
              ))}
            </Card>
          )}
          <Card className="gap-2 p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold">
              <MapPin className="size-4 text-primary" /> Delivering to
            </p>
            <p>
              {addr.name} · {addr.phone}
            </p>
            <p className="text-muted-foreground">
              {addr.line1}
              {addr.line2 ? `, ${addr.line2}` : ""}
              {addr.landmark ? ` (${addr.landmark})` : ""}, {addr.city} {addr.pincode}
            </p>
          </Card>
          <Card className="gap-2 p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold">
              <Store className="size-4 text-primary" /> {order.shop.name}
            </p>
            <p className="text-muted-foreground">
              {order.shop.address?.line1}, {order.shop.address?.city}
            </p>
            <a href={`tel:${order.shop.contactPhone}`} className="inline-flex items-center gap-1 text-primary">
              <Phone className="size-3.5" /> {order.shop.contactPhone}
            </a>
          </Card>
        </div>
      </div>
    </div>
  );
}
