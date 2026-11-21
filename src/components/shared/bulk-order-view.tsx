import { Bike, Check, MapPin, Package, Phone, Store } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/shared/status-badge";
import { BULK_FULFILMENT_LABEL, BULK_STATUS, type BulkStatus } from "@/lib/bulk";
import { bpsToPercent, formatINR } from "@/lib/money";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Addr = { shopName: string; phone: string; line1: string; line2?: string | null; landmark?: string | null; city: string; state: string; pincode: string };

export type BulkOrderViewData = {
  number: string;
  status: BulkStatus;
  fulfilment: "DELIVERY" | "PICKUP";
  paymentMethod: "ONLINE" | "ON_DELIVERY";
  paymentStatus: string;
  refundStatus: string | null;
  itemCount: number;
  subtotal: number;
  deliveryFee: number;
  total: number;
  note: string | null;
  rejectReason: string | null;
  cancelledBy: string | null;
  buyerAddress: unknown;
  createdAt: Date;
  acceptedAt: Date | null;
  dispatchedAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  items: {
    id: string;
    productName: string;
    variantName: string | null;
    unitLabel: string | null;
    imageUrl: string | null;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
  buyerShop: { name: string; contactPhone: string };
  sellerShop: { name: string; contactPhone: string; address: { line1: string; city: string; pincode: string } | null };
  commission: { amount: number; rateBps: number; shopEarning: number; dealerAmount: number } | null;
};

/** Read-only bulk order: progress, parties, items and money. Shared by the shop panel and the admin. */
export function BulkOrderView({ o, side }: { o: BulkOrderViewData; side: "buyer" | "seller" | "admin" }) {
  const st = BULK_STATUS[o.status];
  const a = o.buyerAddress as Addr;
  const pickup = o.fulfilment === "PICKUP";
  const ended = o.status === "REJECTED" || o.status === "CANCELLED";
  const steps = [
    { label: "Placed", at: o.createdAt },
    { label: "Accepted", at: o.acceptedAt },
    { label: pickup ? "Ready for pickup" : "Out for delivery", at: o.dispatchedAt },
    { label: pickup ? "Picked up" : "Delivered", at: o.deliveredAt },
  ];
  const paymentLine =
    o.paymentMethod === "ONLINE"
      ? o.paymentStatus === "REFUNDED"
        ? "Paid online · refunded"
        : o.refundStatus === "PENDING"
          ? "Paid online · refund in progress"
          : o.refundStatus === "FAILED"
            ? "Paid online · refund failed (support is on it)"
            : o.paymentStatus === "CAPTURED"
              ? "Paid online"
              : "Online payment pending"
      : o.paymentStatus === "CAPTURED"
        ? `Paid to seller on ${pickup ? "pickup" : "delivery"}`
        : `Pay seller on ${pickup ? "pickup" : "delivery"} (cash / UPI)`;

  return (
    <div className="space-y-4">
      <Card className="gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs text-muted-foreground">Bulk order · {fmtDateTime(o.createdAt)}</p>
            <p className="text-xl font-bold">{o.number}</p>
          </div>
          <Pill tone={st.tone} className="px-3 py-1 text-sm">
            {st.label}
          </Pill>
        </div>
        {ended ? (
          <p className="rounded-xl bg-muted p-3 text-sm">
            {o.status === "REJECTED"
              ? "Rejected by the seller"
              : o.cancelledBy === "SYSTEM"
                ? "Cancelled automatically"
                : `Cancelled by the ${o.cancelledBy === "SELLER" ? "seller" : "buyer"}`}
            {o.rejectReason ? `: ${o.rejectReason}` : ""}
            {o.cancelledAt ? ` · ${fmtDateTime(o.cancelledAt)}` : ""}
          </p>
        ) : (
          <ol className="grid grid-cols-4 gap-1">
            {steps.map((s, i) => (
              <li key={s.label} className="flex flex-col items-center text-center">
                <span
                  className={cn(
                    "grid size-7 place-items-center rounded-full border-2 text-xs font-bold",
                    s.at ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30 text-muted-foreground",
                  )}
                >
                  {s.at ? <Check className="size-4" /> : i + 1}
                </span>
                <span className={cn("mt-1 text-[11px] leading-tight font-medium", !s.at && "text-muted-foreground")}>{s.label}</span>
                {s.at && <span className="text-[10px] text-muted-foreground">{fmtDateTime(s.at)}</span>}
              </li>
            ))}
          </ol>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="gap-2 p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold">
            <Store className="size-4 text-primary" /> Seller {side === "seller" && <span className="text-xs font-normal text-muted-foreground">(you)</span>}
          </p>
          <p className="font-medium">{o.sellerShop.name}</p>
          {o.sellerShop.address && (
            <p className="text-muted-foreground">
              {o.sellerShop.address.line1}, {o.sellerShop.address.city} {o.sellerShop.address.pincode}
            </p>
          )}
          <a href={`tel:${o.sellerShop.contactPhone}`} className="flex items-center gap-1.5 text-primary">
            <Phone className="size-3.5" /> {o.sellerShop.contactPhone}
          </a>
        </Card>
        <Card className="gap-2 p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold">
            <MapPin className="size-4 text-primary" /> Buyer {side === "buyer" && <span className="text-xs font-normal text-muted-foreground">(you)</span>}
          </p>
          <p className="font-medium">{a.shopName ?? o.buyerShop.name}</p>
          <p className="text-muted-foreground">{[a.line1, a.line2, a.landmark, `${a.city} ${a.pincode}`].filter(Boolean).join(", ")}</p>
          <a href={`tel:${a.phone ?? o.buyerShop.contactPhone}`} className="flex items-center gap-1.5 text-primary">
            <Phone className="size-3.5" /> {a.phone ?? o.buyerShop.contactPhone}
          </a>
        </Card>
      </div>

      <Card className="gap-0 overflow-hidden p-0">
        <p className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold">
          <Package className="size-4" /> {o.items.length} product{o.items.length === 1 ? "" : "s"} · {o.itemCount} units
        </p>
        <ul className="divide-y">
          {o.items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              {i.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={i.imageUrl} alt="" className="size-10 shrink-0 rounded-lg border bg-white object-contain" />
              ) : (
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted">
                  <Package className="size-4 text-muted-foreground" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{i.productName}</span>
                <span className="text-xs text-muted-foreground">
                  {i.variantName ?? i.unitLabel} · {i.quantity} × {formatINR(i.unitPrice)}
                </span>
              </span>
              <span className="font-semibold tabular-nums">{formatINR(i.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <div className="space-y-1 border-t bg-muted/40 px-4 py-3 text-sm">
          <p className="flex justify-between">
            <span>Items</span>
            <span className="tabular-nums">{formatINR(o.subtotal)}</span>
          </p>
          <p className="flex justify-between">
            <span className="flex items-center gap-1">
              {pickup ? <Store className="size-3.5" /> : <Bike className="size-3.5" />} {BULK_FULFILMENT_LABEL[o.fulfilment]}
            </span>
            <span className="tabular-nums">{o.deliveryFee ? formatINR(o.deliveryFee) : "Free"}</span>
          </p>
          <p className="flex justify-between border-t pt-1 text-base font-bold">
            <span>Total</span>
            <span className="tabular-nums">{formatINR(o.total)}</span>
          </p>
          <p className="text-xs text-muted-foreground">{paymentLine}</p>
        </div>
      </Card>

      {o.note && (
        <Card className="gap-1 p-4 text-sm">
          <p className="font-semibold">Note from buyer</p>
          <p className="text-muted-foreground">{o.note}</p>
        </Card>
      )}

      {o.commission && side !== "buyer" && (
        <Card className="gap-1 p-4 text-sm">
          <p className="font-semibold">Settlement</p>
          <p className="flex justify-between">
            <span className="text-muted-foreground">B2B commission ({bpsToPercent(o.commission.rateBps)})</span>
            <span className="tabular-nums">{formatINR(o.commission.amount)}</span>
          </p>
          <p className="flex justify-between">
            <span className="text-muted-foreground">
              {o.commission.shopEarning >= 0 ? "Seller earning (paid with payouts)" : "Charged to seller balance (cash was collected)"}
            </span>
            <span className={cn("font-semibold tabular-nums", o.commission.shopEarning < 0 && "text-red-600")}>{formatINR(o.commission.shopEarning)}</span>
          </p>
          {side === "admin" && o.commission.dealerAmount > 0 && (
            <p className="flex justify-between">
              <span className="text-muted-foreground">Dealer share</span>
              <span className="tabular-nums">{formatINR(o.commission.dealerAmount)}</span>
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
