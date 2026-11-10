import { cn } from "@/lib/utils";
import { STATUS_META, SHIPMENT_STATUS_LABEL, type OrderStatusKey } from "@/lib/order-status";

const TONES = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  danger: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200",
  primary: "bg-secondary text-secondary-foreground",
} as const;

export type Tone = keyof typeof TONES;

export function Pill({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", TONES[tone], className)}>
      {children}
    </span>
  );
}

export function OrderStatusBadge({ status, className }: { status: string; className?: string }) {
  const meta = STATUS_META[status as OrderStatusKey] ?? { label: status, tone: "neutral" as const };
  return (
    <Pill tone={meta.tone} className={className}>
      {meta.label}
    </Pill>
  );
}

const SHIP_TONE: Record<string, Tone> = {
  DELIVERED: "success",
  EXCEPTION: "danger",
  FAILED_ATTEMPT: "danger",
  RTO: "danger",
  CANCELLED: "neutral",
  CREATING: "warning",
  PENDING: "warning",
};

export function ShipmentStatusBadge({ status }: { status: string }) {
  return <Pill tone={SHIP_TONE[status] ?? "primary"}>{SHIPMENT_STATUS_LABEL[status] ?? status}</Pill>;
}

export function PaymentBadge({ status, method }: { status: string; method?: string }) {
  const tone: Tone = status === "CAPTURED" ? "success" : status === "FAILED" ? "danger" : status.includes("REFUND") ? "neutral" : "warning";
  const label = status === "CAPTURED" ? "Paid" : status === "PENDING" && method === "COD" ? "Pay on delivery" : status.replace("_", " ").toLowerCase();
  return (
    <Pill tone={tone} className="capitalize">
      {label}
    </Pill>
  );
}
