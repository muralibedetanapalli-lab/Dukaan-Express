"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertOctagon, Bike, FileText, FlaskConical, Loader2, RefreshCw, RotateCw, Truck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmButton } from "@/components/shared/confirm-button";
import { ShipmentStatusBadge, Pill } from "@/components/shared/status-badge";
import { SandboxBadge } from "@/components/shared/misc";
import { api, errorMessage } from "@/lib/api-client";
import { formatINR } from "@/lib/money";
import { fmtDateTime } from "@/lib/format";

interface Shipment {
  status: string;
  provider: string;
  channelOrderId: string;
  shiprocketOrderId: string | null;
  shiprocketShipmentId: string | null;
  awbCode: string | null;
  courierName: string | null;
  riderName: string | null;
  riderPhone: string | null;
  freightCharge: number | null;
  etd: string | null;
  labelUrl: string | null;
  trackingUrl: string | null;
  pickupScheduledAt: Date | string | null;
  pickupToken: string | null;
  attempts: number;
  failedDeliveryCount: number;
  lastError: string | null;
  events: { id: string; status: string; description: string | null; location: string | null; source: string; occurredAt: Date | string }[];
}

interface Courier {
  courierCompanyId: number;
  courierName: string;
  rate: number;
  etd: string | null;
  rating: number | null;
  recommended: boolean;
}

/** Shipment management used by both the shop app and the admin console. */
export function ShipmentPanel({
  orderId,
  role,
  orderStatus,
  shipment,
  sandbox,
}: {
  orderId: string;
  role: "shop" | "admin";
  orderStatus: string;
  shipment: Shipment | null;
  sandbox: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [couriers, setCouriers] = useState<Courier[] | null>(null);

  const endpoint = role === "shop" ? `/shop/orders/${orderId}/shipment` : `/admin/orders/${orderId}/action`;
  const call = async (action: string, extra: Record<string, unknown> = {}) => {
    const body = role === "shop" ? { action, ...extra } : { action: { retry: "shipment_create", cancel: "shipment_cancel", refresh: "shipment_refresh", simulate: "simulate_courier" }[action] ?? action, ...extra };
    return api<{ ok?: boolean; error?: string }>(endpoint, { body });
  };

  async function run(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    try {
      const r = await call(action, extra);
      if (r && r.ok === false) toast.warning(r.error ?? "Shipment exception");
      else toast.success(action === "simulate" ? "Courier update received" : "Done");
      setCouriers(null);
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function loadCouriers() {
    setBusy("couriers");
    try {
      const r =
        role === "shop"
          ? await api<{ couriers: Courier[] }>(`/shop/orders/${orderId}/shipment`)
          : await api<{ couriers: Courier[] }>(`/admin/orders/${orderId}/action`, { body: { action: "shipment_couriers" } });
      setCouriers(r.couriers);
      if (!r.couriers.length) toast.warning("No couriers are serviceable for this route right now");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const canCreate = orderStatus === "PACKED";
  const canCancel = !!shipment?.shiprocketOrderId && ["SHIPMENT_CREATED", "COURIER_ASSIGNED"].includes(orderStatus);
  const canSimulate = sandbox && !!shipment?.awbCode && ["SHIPMENT_CREATED", "COURIER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERY_FAILED"].includes(orderStatus);

  if (!shipment && !canCreate) return null;

  return (
    <Card className="gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold">
          <Truck className="size-5 text-primary" /> Shipment {sandbox && <SandboxBadge label="Shiprocket sandbox" />}
        </p>
        {shipment && <ShipmentStatusBadge status={shipment.status} />}
      </div>

      {shipment?.status === "EXCEPTION" && (
        <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertOctagon className="size-4 shrink-0" />
          <div>
            <p className="font-semibold">Shipment exception</p>
            <p>{shipment.lastError}</p>
            <p className="mt-1 text-xs">Retry, or choose a different courier below.</p>
          </div>
        </div>
      )}

      {shipment && (
        <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {shipment.awbCode && (
            <p>
              AWB: <span className="font-mono font-semibold">{shipment.awbCode}</span>
            </p>
          )}
          {shipment.courierName && <p>Courier: <b>{shipment.courierName}</b></p>}
          {shipment.shiprocketShipmentId && <p className="text-muted-foreground">Shipment ID: {shipment.shiprocketShipmentId}</p>}
          {shipment.shiprocketOrderId && <p className="text-muted-foreground">SR order: {shipment.shiprocketOrderId}</p>}
          {shipment.pickupScheduledAt && <p>Pickup: {fmtDateTime(shipment.pickupScheduledAt)}</p>}
          {shipment.pickupToken && <p className="text-muted-foreground">Pickup token: {shipment.pickupToken}</p>}
          {shipment.etd && <p>ETD: {shipment.etd}</p>}
          {role === "admin" && shipment.freightCharge != null && <p>Freight: {formatINR(shipment.freightCharge)}</p>}
          {shipment.riderName && (
            <p className="flex items-center gap-1">
              <Bike className="size-4" /> {shipment.riderName} {shipment.riderPhone && `· ${shipment.riderPhone}`}
            </p>
          )}
          {shipment.failedDeliveryCount > 0 && <p className="text-destructive">Failed attempts: {shipment.failedDeliveryCount}</p>}
          {role === "admin" && <p className="text-muted-foreground">Creation attempts: {shipment.attempts}</p>}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {canCreate && (
          <Button onClick={() => run("retry")} disabled={!!busy}>
            {busy === "retry" ? <Loader2 className="animate-spin" /> : <RotateCw />} {shipment ? "Retry shipment" : "Create shipment"}
          </Button>
        )}
        {canCreate && (
          <Button variant="outline" onClick={loadCouriers} disabled={!!busy}>
            {busy === "couriers" && <Loader2 className="animate-spin" />} Choose courier
          </Button>
        )}
        {shipment?.labelUrl && (
          <Button asChild variant="outline">
            <a href={shipment.labelUrl} target="_blank" rel="noopener noreferrer">
              <FileText /> Shipping label
            </a>
          </Button>
        )}
        {shipment?.awbCode && !sandbox && (
          <Button variant="outline" onClick={() => run("refresh")} disabled={!!busy}>
            <RefreshCw /> Refresh tracking
          </Button>
        )}
        {canSimulate && (
          <Button variant="secondary" onClick={() => run("simulate")} disabled={!!busy}>
            {busy === "simulate" ? <Loader2 className="animate-spin" /> : <FlaskConical />} Simulate next courier update
          </Button>
        )}
        {canCancel && (
          <ConfirmButton
            variant="ghost"
            title="Cancel this shipment?"
            description="The Shiprocket order will be cancelled and the order returns to Packed so you can re-ship with another courier."
            destructive
            confirmLabel="Cancel shipment"
            onConfirm={() => run("cancel")}
          >
            <XCircle /> Cancel shipment
          </ConfirmButton>
        )}
      </div>

      {shipment && shipment.events.length > 0 && (
        <details className="text-sm" open={role === "admin"}>
          <summary className="cursor-pointer font-medium text-muted-foreground">Tracking events ({shipment.events.length})</summary>
          <ul className="mt-2 space-y-1.5 border-l-2 pl-3">
            {shipment.events.map((e) => (
              <li key={e.id}>
                <span className="font-medium">{e.status}</span> <span className="text-muted-foreground">— {e.description}</span>
                <span className="block text-xs text-muted-foreground">
                  {fmtDateTime(e.occurredAt)} · {e.source.toLowerCase()}
                  {e.location ? ` · ${e.location}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Dialog open={!!couriers} onOpenChange={(o) => !o && setCouriers(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Available couriers</DialogTitle>
            <DialogDescription>Serviceability from the pickup address to the customer, with live rates and delivery estimates.</DialogDescription>
          </DialogHeader>
          {couriers?.length === 0 && <p className="text-sm text-muted-foreground">No courier can service this shipment right now. Try again later or contact support.</p>}
          <ul className="space-y-2">
            {couriers?.map((c) => (
              <li key={c.courierCompanyId} className="flex items-center justify-between gap-3 rounded-xl border p-3">
                <div className="min-w-0 text-sm">
                  <p className="font-semibold">
                    {c.courierName} {c.recommended && <Pill tone="success">Recommended</Pill>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.etd ?? "ETA n/a"} · {formatINR(c.rate)}
                    {c.rating ? ` · ★ ${c.rating}` : ""}
                  </p>
                </div>
                <Button size="sm" onClick={() => run("retry", { courierCompanyId: c.courierCompanyId })} disabled={!!busy}>
                  Ship
                </Button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
