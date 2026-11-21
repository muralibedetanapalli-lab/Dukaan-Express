import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, ClipboardList } from "lucide-react";
import { getSessionUser } from "@/server/auth/session";
import { activeShopFor } from "@/server/services/inventory";
import { listBulkOrders } from "@/server/services/bulk";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/misc";
import { Pill } from "@/components/shared/status-badge";
import { BULK_FULFILMENT_LABEL, BULK_STATUS } from "@/lib/bulk";
import { formatINR } from "@/lib/money";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Bulk orders" };
export const dynamic = "force-dynamic";

export default async function BulkOrdersPage({ searchParams }: { searchParams: Promise<{ side?: string }> }) {
  const sp = await searchParams;
  const user = (await getSessionUser())!;
  const { shop } = await activeShopFor(user);
  const [buying, selling] = await Promise.all([listBulkOrders(shop.id, "buying"), listBulkOrders(shop.id, "selling")]);
  const waiting = selling.filter((o) => o.status === "PLACED").length;
  const side = sp.side === "selling" || sp.side === "buying" ? sp.side : waiting > 0 ? "selling" : "buying";
  const rows = side === "buying" ? buying : selling;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(
          [
            ["buying", ArrowDownLeft, "Purchases", buying.length, 0],
            ["selling", ArrowUpRight, "Sales", selling.length, waiting],
          ] as const
        ).map(([k, Icon, label, n, badge]) => (
          <Link
            key={k}
            href={`/shop/bulk/orders?side=${k}`}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold",
              side === k ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
            )}
          >
            <Icon className="size-4" /> {label} <span className="text-xs opacity-70">{n}</span>
            {badge > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[10px] text-white">{badge} new</span>}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={side === "buying" ? "No bulk purchases yet" : "No bulk sales yet"}
          description={
            side === "buying"
              ? "Find a wholesaler in 'Buy in bulk' and place your first order."
              : "Switch on 'Sell in bulk' and set bulk prices so other shops can order from you."
          }
        />
      ) : (
        <div className="space-y-2">
          {rows.map((o) => {
            const st = BULK_STATUS[o.status];
            return (
              <Link key={o.id} href={`/shop/bulk/orders/${o.id}`} className="block">
                <Card
                  className={cn(
                    "flex-row items-center gap-3 p-3 transition hover:border-primary/40",
                    side === "selling" && o.status === "PLACED" && "border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {o.number} <Pill tone={st.tone}>{st.label}</Pill>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {side === "buying" ? `From ${o.sellerShop.name}` : `To ${o.buyerShop.name}`} · {o.itemCount} units · {BULK_FULFILMENT_LABEL[o.fulfilment]}{" "}
                      · {fmtDateTime(o.createdAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold tabular-nums">{formatINR(o.total)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {o.paymentMethod === "ONLINE"
                        ? o.paymentStatus === "CAPTURED"
                          ? "Paid online"
                          : o.paymentStatus === "REFUNDED"
                            ? "Refunded"
                            : "Online"
                        : "On delivery"}
                    </p>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
