import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatINR } from "@/lib/money";

interface QuoteLike {
  itemsMrpTotal: number;
  subtotal: number;
  itemDiscount: number;
  couponDiscount: number;
  couponCode?: string | null;
  deliveryFee: number;
  taxAmount: number;
  taxInclusive: boolean;
  total: number;
  amountToFreeDelivery?: number;
}

export function BillSummary({ quote, title = "Bill details" }: { quote: QuoteLike; title?: string }) {
  const saved = quote.itemDiscount + quote.couponDiscount;
  return (
    <Card className="gap-0 p-4 text-sm">
      <p className="mb-3 font-semibold">{title}</p>
      <Row label="Item total (MRP)" value={formatINR(quote.itemsMrpTotal)} />
      {quote.itemDiscount > 0 && <Row label="Product discount" value={`−${formatINR(quote.itemDiscount)}`} accent />}
      {quote.couponDiscount > 0 && <Row label={`Coupon${quote.couponCode ? ` (${quote.couponCode})` : ""}`} value={`−${formatINR(quote.couponDiscount)}`} accent />}
      <Row label="Delivery fee" value={quote.deliveryFee === 0 ? "FREE" : formatINR(quote.deliveryFee)} accent={quote.deliveryFee === 0} />
      <Row label={quote.taxInclusive ? "Taxes (included in prices)" : "Taxes"} value={formatINR(quote.taxAmount)} muted={quote.taxInclusive} />
      <Separator className="my-2" />
      <div className="flex items-center justify-between text-base font-bold">
        <span>To pay</span>
        <span>{formatINR(quote.total)}</span>
      </div>
      {saved > 0 && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-center text-xs font-semibold text-emerald-700">You save {formatINR(saved)} on this order 🎉</p>}
      {!!quote.amountToFreeDelivery && quote.deliveryFee > 0 && (
        <p className="mt-2 text-center text-xs text-muted-foreground">Add {formatINR(quote.amountToFreeDelivery)} more for free delivery</p>
      )}
    </Card>
  );
}

function Row({ label, value, accent, muted }: { label: string; value: string; accent?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={accent ? "font-medium text-emerald-700" : muted ? "text-muted-foreground" : "font-medium"}>{value}</span>
    </div>
  );
}
