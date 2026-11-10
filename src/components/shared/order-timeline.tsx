import { Check, X } from "lucide-react";
import { CUSTOMER_TIMELINE, STATUS_META, type OrderStatusKey } from "@/lib/order-status";
import { fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";

interface History {
  toStatus: string;
  createdAt: Date | string;
  remarks?: string | null;
}

const FAIL: OrderStatusKey[] = ["CANCELLED", "SHOP_REJECTED", "REFUND_PENDING", "REFUNDED", "DELIVERY_FAILED"];

/** Customer-friendly progress timeline derived from the order's status history. */
export function OrderTimeline({ status, history, paymentMethod }: { status: string; history: History[]; paymentMethod: string }) {
  const reached = new Map<string, Date>();
  for (const h of history) {
    const step = CUSTOMER_TIMELINE.find((s) => s.statuses.includes(h.toStatus as OrderStatusKey));
    if (step && !reached.has(step.key)) reached.set(step.key, new Date(h.createdAt));
  }
  const steps = CUSTOMER_TIMELINE.filter((s) => !(s.key === "paid" && paymentMethod === "COD"));
  const lastReached = steps.reduce((idx, s, i) => (reached.has(s.key) ? i : idx), -1);
  const failed = FAIL.includes(status as OrderStatusKey);
  const failEvent = failed ? [...history].reverse().find((h) => FAIL.includes(h.toStatus as OrderStatusKey)) : null;

  return (
    <ol className="relative">
      {steps.map((s, i) => {
        const done = i <= lastReached;
        const current = i === lastReached && !failed && status !== "DELIVERED";
        if (failed && i > lastReached) return null;
        return (
          <li key={s.key} className="relative flex gap-3 pb-5 last:pb-0">
            {i < steps.length - 1 && !(failed && i === lastReached) && (
              <span className={cn("absolute top-6 left-[11px] h-[calc(100%-1rem)] w-0.5", i < lastReached ? "bg-primary" : "bg-border")} />
            )}
            <span
              className={cn(
                "relative z-10 grid size-6 shrink-0 place-items-center rounded-full border-2",
                done ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
                current && "ring-4 ring-primary/20",
              )}
            >
              {done && <Check className="size-3.5" />}
            </span>
            <div className="-mt-0.5">
              <p className={cn("text-sm font-semibold", !done && "text-muted-foreground")}>{s.label}</p>
              {reached.get(s.key) && <p className="text-xs text-muted-foreground">{fmtTime(reached.get(s.key))}</p>}
            </div>
          </li>
        );
      })}
      {failed && failEvent && (
        <li className="relative flex gap-3">
          <span className="relative z-10 grid size-6 shrink-0 place-items-center rounded-full bg-destructive text-white">
            <X className="size-3.5" />
          </span>
          <div className="-mt-0.5">
            <p className="text-sm font-semibold text-destructive">{STATUS_META[status as OrderStatusKey]?.label}</p>
            <p className="text-xs text-muted-foreground">
              {fmtTime(failEvent.createdAt)}
              {failEvent.remarks ? ` · ${failEvent.remarks}` : ""}
            </p>
          </div>
        </li>
      )}
    </ol>
  );
}
