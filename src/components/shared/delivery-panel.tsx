"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bike, CheckCircle2, Loader2, Phone, Store, Truck, UserRoundSearch, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmButton } from "@/components/shared/confirm-button";
import { Pill } from "@/components/shared/status-badge";
import { api, errorMessage } from "@/lib/api-client";
import { formatINR } from "@/lib/money";
import { fmtDateTime } from "@/lib/format";
import { DELIVERY_MODE_LABEL, SHIPMENT_STATUS_LABEL } from "@/lib/order-status";
import { shopDelivers, type DeliveryModeKey } from "@/lib/delivery-mode";

export interface DeliveryInfo {
  mode: DeliveryModeKey;
  status: string;
  riderFee: number;
  codAmount: number;
  deliveryCode: string;
  searchStartedAt: Date | string | null;
  failedDeliveryCount: number;
  lastError: string | null;
  rider: { vehicleType: string | null; vehicleNumber: string | null; locationAt: Date | string | null; user: { name: string | null; phone: string | null } } | null;
  events: { id: string; status: string; description: string | null; occurredAt: Date | string }[];
}

/** Delivery status and actions — shop (own delivery, fallback) and admin (assign rider, complete, fail). */
export function DeliveryPanel({
  orderId,
  role,
  orderStatus,
  shopMode,
  delivery,
  riders = [],
}: {
  orderId: string;
  role: "shop" | "admin";
  orderStatus: string;
  shopMode: DeliveryModeKey;
  delivery: DeliveryInfo | null;
  riders?: { id: string; name: string; detail: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState("");
  const [riderId, setRiderId] = useState("");

  const call = async (key: string, body: Record<string, unknown>, ok: string) => {
    setBusy(key);
    try {
      if (role === "shop") await api(`/shop/orders/${orderId}/delivery`, { body });
      else await api(`/admin/orders/${orderId}/action`, { body });
      toast.success(ok);
      setCodeOpen(false);
      setCode("");
      router.refresh();
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const mode = delivery?.mode ?? shopMode;
  const own = shopDelivers(mode);
  const booked = mode === "SELF_BOOKED";
  const searching = orderStatus === "SHIPMENT_CREATED";
  const outForDelivery = orderStatus === "OUT_FOR_DELIVERY";
  const canDeliverOwn = (orderStatus === "PACKED" && (own || !delivery)) || searching || (orderStatus === "DELIVERY_FAILED" && own);
  const canComplete = outForDelivery && (role === "admin" || own);
  const preDispatch = ["SHOP_PENDING", "SHOP_ACCEPTED", "PREPARING", "READY_FOR_PACKING"].includes(orderStatus);

  if (!delivery && !canDeliverOwn && !preDispatch && orderStatus !== "PACKED") return null;

  return (
    <Card className="gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold">
          {own ? <Store className="size-4" /> : <Bike className="size-4" />} Delivery
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Pill>{DELIVERY_MODE_LABEL[mode]}</Pill>
          {delivery && <Pill tone={delivery.status === "DELIVERED" ? "success" : delivery.status === "FAILED_ATTEMPT" ? "danger" : "primary"}>{SHIPMENT_STATUS_LABEL[delivery.status] ?? delivery.status}</Pill>}
        </div>
      </div>

      {preDispatch && (
        <p className="text-sm text-muted-foreground">
          {booked
            ? "Book Rapido, Ola or Porter for this order once it's packed, then mark it out for delivery. The customer paid no delivery fee."
            : own ? "Your own staff delivers this order. You'll send it out once it's packed." : "When you mark the order packed, nearby Dukaan Express riders are alerted to pick it up."}
        </p>
      )}

      {searching && (
        <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <UserRoundSearch className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">Finding a rider…</p>
            <p className="text-xs">
              Nearby riders have been alerted{delivery?.searchStartedAt ? ` since ${fmtDateTime(delivery.searchStartedAt)}` : ""}. If nobody accepts, you can deliver it with your own staff.
            </p>
          </div>
        </div>
      )}

      {delivery?.rider && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/60 p-3 text-sm">
          <div>
            <p className="font-semibold">{delivery.rider.user.name}</p>
            <p className="text-xs text-muted-foreground">
              {[delivery.rider.vehicleType, delivery.rider.vehicleNumber].filter(Boolean).join(" · ") || "Rider"}
              {orderStatus === "COURIER_ASSIGNED" ? " · on the way to the shop" : outForDelivery ? " · delivering now" : ""}
            </p>
          </div>
          {delivery.rider.user.phone && (
            <Button asChild variant="outline" size="sm">
              <a href={`tel:${delivery.rider.user.phone}`}>
                <Phone /> {delivery.rider.user.phone}
              </a>
            </Button>
          )}
        </div>
      )}

      {delivery && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
          {delivery.codAmount > 0 && (
            <div>
              <dt className="text-xs text-muted-foreground">Cash to collect</dt>
              <dd className="font-semibold">{formatINR(delivery.codAmount)}</dd>
            </div>
          )}
          {!own && (
            <div>
              <dt className="text-xs text-muted-foreground">Rider earns</dt>
              <dd className="font-semibold">{formatINR(delivery.riderFee)}</dd>
            </div>
          )}
          {role === "admin" && (
            <div>
              <dt className="text-xs text-muted-foreground">Handover code</dt>
              <dd className="font-mono font-semibold">{delivery.deliveryCode}</dd>
            </div>
          )}
          {delivery.failedDeliveryCount > 0 && (
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Failed attempts</dt>
              <dd className="text-red-600">
                {delivery.failedDeliveryCount}
                {delivery.lastError ? ` — ${delivery.lastError}` : ""}
              </dd>
            </div>
          )}
        </dl>
      )}

      <div className="flex flex-wrap gap-2">
        {canDeliverOwn && (
          <ConfirmButton
            title={searching ? "Deliver it yourself?" : "Send out for delivery?"}
            description={
              searching
                ? "Stop looking for a rider and deliver with your own staff. You keep the delivery fee. Ask the customer for their 4-digit code on delivery."
                : booked
                  ? "Hand the order to the Rapido / Ola partner you booked. Ask the customer for their 4-digit code on delivery (or have the partner call you with it)."
                  : "Your delivery person takes the order now. Ask the customer for their 4-digit code when you hand it over."
            }
            confirmLabel="Out for delivery"
            onConfirm={() => call("own", { action: "deliver_own" }, "Out for delivery")}
            size="sm"
            variant={searching ? "outline" : "default"}
          >
            <Truck /> {searching ? "Deliver it yourself" : orderStatus === "DELIVERY_FAILED" ? "Try delivering again" : "Out for delivery"}
          </ConfirmButton>
        )}
        {role === "admin" && orderStatus === "PACKED" && !delivery && shopMode === "RIDER" && (
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => call("start", { action: "delivery_start" }, "Looking for a rider")}>
            <Bike /> Find a rider
          </Button>
        )}
        {canComplete && (
          <Button size="sm" onClick={() => setCodeOpen(true)}>
            <CheckCircle2 /> Mark delivered
          </Button>
        )}
        {outForDelivery && (role === "admin" || own) && (
          <ConfirmButton
            title="Couldn't deliver?"
            description="The order is marked as delivery failed. You can try again later."
            confirmLabel="Mark failed"
            destructive
            requireReason
            reasonLabel="What happened? (e.g. customer not reachable)"
            onConfirm={(reason) => call("fail", { action: "delivery_failed", reason }, "Marked as failed")}
            size="sm"
            variant="outline"
          >
            <XCircle /> Couldn&apos;t deliver
          </ConfirmButton>
        )}
      </div>

      {role === "admin" && searching && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Select value={riderId} onValueChange={setRiderId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder={riders.length ? "Assign a rider" : "No free riders online"} />
            </SelectTrigger>
            <SelectContent>
              {riders.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name} · {r.detail}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" disabled={!riderId || !!busy} onClick={() => call("assign", { action: "assign_rider", riderId }, "Rider assigned")}>
            {busy === "assign" && <Loader2 className="animate-spin" />} Assign
          </Button>
        </div>
      )}

      {delivery && delivery.events.length > 0 && (
        <ol className="space-y-1 border-t pt-3 text-xs">
          {delivery.events.slice(0, 6).map((e) => (
            <li key={e.id} className="flex gap-2">
              <span className="w-32 shrink-0 text-muted-foreground">{fmtDateTime(e.occurredAt)}</span>
              <span>{e.description ?? SHIPMENT_STATUS_LABEL[e.status] ?? e.status}</span>
            </li>
          ))}
        </ol>
      )}

      <Dialog open={codeOpen} onOpenChange={setCodeOpen}>
        <DialogContent className="sm:max-w-sm">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              call("complete", { action: "delivery_complete", code }, "Delivered");
            }}
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle>Customer&apos;s delivery code</DialogTitle>
              <DialogDescription>Ask the customer for the 4-digit code shown in their order. It confirms they received the order.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="dcode">4-digit code</Label>
              <Input
                id="dcode"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                inputMode="numeric"
                autoComplete="one-time-code"
                className="h-12 text-center font-mono text-2xl tracking-[0.5em]"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="submit" className="w-full" disabled={code.length !== 4 || !!busy}>
                {busy === "complete" && <Loader2 className="animate-spin" />} Confirm delivery
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
