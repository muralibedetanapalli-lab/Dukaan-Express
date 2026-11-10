import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { getOrderForActor } from "@/server/services/order";
import { nextStatuses } from "@/server/services/order-state";
import { integrationModes } from "@/server/env";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KeyValue, PageHeader, ProductThumb } from "@/components/shared/misc";
import { OrderStatusBadge, PaymentBadge, Pill } from "@/components/shared/status-badge";
import { ShipmentPanel } from "@/components/shared/shipment-panel";
import { RealtimeListener } from "@/components/shared/realtime";
import { ActionButton } from "@/components/admin/action-button";
import { formatINR, bpsToPercent } from "@/lib/money";
import { fmtDateTime } from "@/lib/format";
import type { OrderStatusKey } from "@/lib/order-status";
import { AdminOrderControls } from "./order-controls";

export const dynamic = "force-dynamic";

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await getSessionUser())!;
  let order;
  try {
    order = await getOrderForActor(id, { id: user.id, role: "SUPER_ADMIN" });
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
  const addr = order.addressSnapshot as Record<string, string | null>;
  const captured = order.payments.find((p) => p.status === "CAPTURED" || p.status === "PARTIALLY_REFUNDED");
  const refunded = order.refunds.filter((r) => r.status !== "FAILED").reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-4">
      <RealtimeListener />
      <PageHeader
        back={{ href: "/admin/orders", label: "Orders" }}
        title={`Order ${order.orderNumber}`}
        description={`Placed ${fmtDateTime(order.placedAt)} · ${order.distanceKm.toFixed(1)} km · ETA ${order.etaMinutes} min`}
        actions={
          <>
            <OrderStatusBadge status={order.status} />
            <PaymentBadge status={order.paymentStatus} method={order.paymentMethod} />
          </>
        }
      />

      <AdminOrderControls
        orderId={order.id}
        allowed={nextStatuses(order.status as OrderStatusKey, "SUPER_ADMIN")}
        refundable={captured ? captured.amount - refunded : 0}
      />

      {order.modifications
        .filter((m) => m.status === "PENDING")
        .map((m) => (
          <Card key={m.id} className="gap-2 border-amber-300 bg-amber-50 p-4">
            <p className="font-semibold text-amber-900">Shop requested a modification</p>
            <p className="text-sm">{m.reason}</p>
            <ul className="text-sm">
              {(m.changes as { orderItemId: string; newQuantity: number }[]).map((c) => {
                const item = order.items.find((i) => i.id === c.orderItemId);
                return (
                  <li key={c.orderItemId}>
                    {item?.productName}: {item?.quantity} → <b>{c.newQuantity}</b>
                  </li>
                );
              })}
            </ul>
            <div className="flex gap-2">
              <ActionButton path={`/admin/modifications/${m.id}`} body={{ approve: true }} success="Modification approved" confirm={{ title: "Approve modification?", description: "Quantities will be reduced, stock restored, totals recalculated and any difference refunded." }}>
                Approve
              </ActionButton>
              <ActionButton path={`/admin/modifications/${m.id}`} body={{ approve: false }} variant="outline" success="Modification rejected">
                Reject
              </ActionButton>
            </div>
          </Card>
        ))}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card className="gap-0 p-0">
            <p className="border-b px-4 py-3 font-semibold">Items</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">MRP</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <ProductThumb src={i.imageUrl} alt="" className="size-9" />
                        <span>
                          {i.productName}
                          <span className="block text-xs text-muted-foreground">{i.variantName ?? i.unitLabel}</span>
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{i.quantity}</TableCell>
                    <TableCell className="text-right">{formatINR(i.mrp)}</TableCell>
                    <TableCell className="text-right">{formatINR(i.unitPrice)}</TableCell>
                    <TableCell className="text-right text-xs">
                      {formatINR(i.taxAmount)} ({bpsToPercent(i.taxRateBps)})
                    </TableCell>
                    <TableCell className="text-right font-semibold">{formatINR(i.lineTotal)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <ShipmentPanel orderId={order.id} role="admin" orderStatus={order.status} shipment={order.shipment} sandbox={integrationModes().shiprocket === "mock"} />

          <Card className="gap-0 p-0">
            <p className="border-b px-4 py-3 font-semibold">Status history</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead>Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.statusHistory.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="text-xs whitespace-nowrap">{fmtDateTime(h.createdAt)}</TableCell>
                    <TableCell>{h.fromStatus ? <OrderStatusBadge status={h.fromStatus} /> : "—"}</TableCell>
                    <TableCell>
                      <OrderStatusBadge status={h.toStatus} />
                    </TableCell>
                    <TableCell className="text-xs">{h.changedByRole.replace("_", " ").toLowerCase()}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{h.remarks}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="gap-0 p-4">
            <p className="mb-2 font-semibold">Amounts</p>
            <KeyValue label="Items (MRP)">{formatINR(order.itemsMrpTotal)}</KeyValue>
            <KeyValue label="Items (selling)">{formatINR(order.subtotal)}</KeyValue>
            <KeyValue label={`Coupon ${order.couponCode ?? ""}`}>−{formatINR(order.couponDiscount)}</KeyValue>
            <KeyValue label="Delivery fee">{formatINR(order.deliveryFee)}</KeyValue>
            <KeyValue label={`Tax ${order.taxInclusive ? "(incl.)" : ""}`}>{formatINR(order.taxAmount)}</KeyValue>
            <KeyValue label="Order total">
              <span className="text-base">{formatINR(order.total)}</span>
            </KeyValue>
            <KeyValue label={`Commission (${bpsToPercent(order.commissionBps)})`}>{formatINR(order.commissionAmount)}</KeyValue>
            <KeyValue label="Shop earning">{formatINR(order.shopEarning)}</KeyValue>
          </Card>
          <Card className="gap-2 p-4 text-sm">
            <p className="font-semibold">Payments</p>
            {order.payments.map((p) => (
              <div key={p.id} className="rounded-lg border p-2">
                <div className="flex justify-between">
                  <span>
                    {p.provider} · {p.method}
                  </span>
                  <PaymentBadge status={p.status} method={p.method} />
                </div>
                <p className="text-xs text-muted-foreground">{formatINR(p.amount)}</p>
                {p.providerOrderId && <p className="font-mono text-xs text-muted-foreground">{p.providerOrderId}</p>}
                {p.providerPaymentId && <p className="font-mono text-xs text-muted-foreground">{p.providerPaymentId}</p>}
                {p.failureReason && <p className="text-xs text-destructive">{p.failureReason}</p>}
              </div>
            ))}
            {order.refunds.length > 0 && <p className="pt-1 font-semibold">Refunds</p>}
            {order.refunds.map((r) => (
              <div key={r.id} className="flex justify-between gap-2 text-xs">
                <span>{r.reason}</span>
                <span>
                  {formatINR(r.amount)} <Pill tone={r.status === "PROCESSED" ? "success" : r.status === "FAILED" ? "danger" : "warning"}>{r.status.toLowerCase()}</Pill>
                </span>
              </div>
            ))}
          </Card>
          <Card className="gap-1 p-4 text-sm">
            <p className="font-semibold">Customer</p>
            <Link href={`/admin/customers/${order.customerId}`} className="text-primary hover:underline">
              {order.customer.user.name ?? "—"}
            </Link>
            <p>
              {addr.name} · {addr.phone}
            </p>
            <p className="text-muted-foreground">
              {addr.line1}
              {addr.line2 ? `, ${addr.line2}` : ""}, {addr.city} {addr.pincode}
            </p>
            {order.notes && <p className="mt-1 rounded bg-muted p-2 text-xs">Note: {order.notes}</p>}
          </Card>
          <Card className="gap-1 p-4 text-sm">
            <p className="font-semibold">Shop</p>
            <Link href={`/admin/shops/${order.shopId}`} className="text-primary hover:underline">
              {order.shop.name}
            </Link>
            <p className="text-muted-foreground">
              {order.shop.address?.line1}, {order.shop.address?.pincode} · {order.shop.contactPhone}
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
