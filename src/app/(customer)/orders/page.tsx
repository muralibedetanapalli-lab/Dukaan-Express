import Link from "next/link";
import { ChevronRight, Package } from "lucide-react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/misc";
import { OrderStatusBadge } from "@/components/shared/status-badge";
import { RealtimeListener } from "@/components/shared/realtime";
import { formatINR } from "@/lib/money";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "My orders" };

export default async function OrdersPage() {
  const user = await getSessionUser();
  if (!user?.customerId) redirect("/login?next=/orders");
  const orders = await db.order.findMany({
    where: { customerId: user.customerId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { shop: { select: { name: true, logoUrl: true } }, items: { select: { productName: true, quantity: true, imageUrl: true } } },
  });
  return (
    <div className="mx-auto max-w-3xl">
      <RealtimeListener />
      <h1 className="mb-4 text-xl font-bold">My orders</h1>
      {orders.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No orders yet"
          description="Your orders will appear here."
          action={
            <Button asChild>
              <Link href="/">Start shopping</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <Link key={o.id} href={`/orders/${o.id}`}>
              <Card className="gap-3 p-4 transition hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{o.shop.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {o.orderNumber} · {fmtDateTime(o.createdAt)}
                    </p>
                  </div>
                  <OrderStatusBadge status={o.status} />
                </div>
                <div className="flex items-center gap-2">
                  {o.items.slice(0, 5).map((i, idx) => (
                    <div key={idx} className="size-11 overflow-hidden rounded-lg border bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {i.imageUrl && <img src={i.imageUrl} alt="" className="size-full object-cover" />}
                    </div>
                  ))}
                  {o.items.length > 5 && <span className="text-xs text-muted-foreground">+{o.items.length - 5}</span>}
                  <div className="ml-auto flex items-center gap-1 font-bold">
                    {formatINR(o.total)} <ChevronRight className="size-4 text-muted-foreground" />
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
