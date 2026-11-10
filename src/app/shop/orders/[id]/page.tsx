import { notFound } from "next/navigation";
import { MapPin, StickyNote } from "lucide-react";
import { getSessionUser } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { getOrderForActor } from "@/server/services/order";
import { SHOP_FORWARD_ACTION } from "@/server/services/order-state";
import { integrationModes } from "@/server/env";
import { Card } from "@/components/ui/card";
import { PageHeader, ProductThumb, KeyValue } from "@/components/shared/misc";
import { OrderStatusBadge, PaymentBadge, Pill } from "@/components/shared/status-badge";
import { formatINR } from "@/lib/money";
import { fmtDateTime } from "@/lib/format";
import type { OrderStatusKey } from "@/lib/order-status";
import { ShopOrderActions } from "./shop-order-actions";
import { ShipmentPanel } from "@/components/shared/shipment-panel";

export const dynamic = "force-dynamic";

export default async function ShopOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await getSessionUser())!;
  let order;
  try {
    order = await getOrderForActor(id, { id: user.id, role: "SHOP_OWNER", shopOwnerId: user.shopOwnerId });
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
  const status = order.status as OrderStatusKey;
  const addr = order.addressSnapshot as Record<string, string | null>;
  const pendingMod = order.modifications.find((m) => m.status === "PENDING");

  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: "/shop/orders", label: "Orders" }}
        title={order.orderNumber}
        description={`Placed ${fmtDateTime(order.placedAt)}`}
        actions={
          <>
            <OrderStatusBadge status={order.status} />
            <PaymentBadge status={order.paymentStatus} method={order.paymentMethod} />
          </>
        }
      />

      <ShopOrderActions
        orderId={order.id}
        forward={SHOP_FORWARD_ACTION[status] ?? null}
        canReject={status === "SHOP_PENDING"}
        canModify={["SHOP_ACCEPTED", "PREPARING", "READY_FOR_PACKING"].includes(status) && !pendingMod}
        items={order.items.map((i) => ({ id: i.id, name: i.productName, quantity: i.quantity }))}
      />
      {pendingMod && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Modification request pending admin approval: {pendingMod.reason}</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card className="gap-0 p-0">
            <p className="border-b px-4 py-3 font-semibold">Items to pack ({order.items.reduce((s, i) => s + i.quantity, 0)})</p>
            <ul className="divide-y">
              {order.items.map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-4 py-3">
                  <ProductThumb src={i.imageUrl} alt={i.productName} className="size-12 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{i.productName}</p>
                    <p className="text-xs text-muted-foreground">{i.variantName ?? i.unitLabel}</p>
                  </div>
                  <span className="rounded-lg bg-secondary px-2.5 py-1 text-lg font-bold text-primary">×{i.quantity}</span>
                  <span className="w-20 text-right text-sm">{formatINR(i.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <p className="border-t px-4 py-2 text-xs text-muted-foreground">Prices and quantities are locked after the order is placed. Use “Request change” if an item is unavailable.</p>
          </Card>
          {order.notes && (
            <Card className="flex-row gap-2 p-4 text-sm">
              <StickyNote className="size-4 shrink-0 text-amber-600" /> {order.notes}
            </Card>
          )}
          <ShipmentPanel
            orderId={order.id}
            role="shop"
            orderStatus={order.status}
            shipment={order.shipment}
            sandbox={integrationModes().shiprocket === "mock"}
          />
        </div>
        <div className="space-y-4">
          <Card className="gap-0 p-4">
            <p className="mb-2 font-semibold">Payment</p>
            <KeyValue label="Items">{formatINR(order.subtotal)}</KeyValue>
            {order.couponDiscount > 0 && <KeyValue label="Coupon">−{formatINR(order.couponDiscount)}</KeyValue>}
            <KeyValue label="Delivery fee">{formatINR(order.deliveryFee)}</KeyValue>
            <KeyValue label="Customer pays">{formatINR(order.total)}</KeyValue>
            <KeyValue label={`Commission (${order.commissionBps / 100}%)`}>−{formatINR(order.commissionAmount)}</KeyValue>
            <KeyValue label="Your earning" className="font-bold">
              <span className="text-primary">{formatINR(order.shopEarning)}</span>
            </KeyValue>
            {order.paymentMethod === "COD" && <Pill tone="warning" className="mt-2">Collect {formatINR(order.total)} cash via courier</Pill>}
          </Card>
          <Card className="gap-1 p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold">
              <MapPin className="size-4 text-primary" /> Delivery to
            </p>
            <p>{order.customer.user.name ?? addr.name}</p>
            <p className="text-muted-foreground">
              {addr.line1}, {addr.city} {addr.pincode} · {order.distanceKm.toFixed(1)} km
            </p>
          </Card>
          <Card className="gap-2 p-4 text-sm">
            <p className="font-semibold">Status history</p>
            <ul className="space-y-1.5">
              {order.statusHistory.map((h) => (
                <li key={h.id} className="flex justify-between gap-2 text-xs">
                  <span>
                    <OrderStatusBadge status={h.toStatus} /> {h.remarks && <span className="text-muted-foreground">{h.remarks}</span>}
                  </span>
                  <span className="shrink-0 text-muted-foreground">{fmtDateTime(h.createdAt).split(", ")[1]}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
