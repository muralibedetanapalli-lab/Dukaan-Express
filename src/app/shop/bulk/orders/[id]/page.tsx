import { notFound } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { bulkOrderFor } from "@/server/services/bulk";
import { AppError } from "@/server/errors";
import { PageHeader } from "@/components/shared/misc";
import { BulkOrderView } from "@/components/shared/bulk-order-view";
import { BulkOrderActions } from "./order-actions";

export const metadata = { title: "Bulk order" };
export const dynamic = "force-dynamic";

export default async function BulkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await getSessionUser())!;
  let r;
  try {
    r = await bulkOrderFor(user, id);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
  const { order: o, side } = r;
  if (side === "admin") notFound();
  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: `/shop/bulk/orders?side=${side === "seller" ? "selling" : "buying"}`, label: "Bulk orders" }}
        title={side === "seller" ? `Sale to ${o.buyerShop.name}` : `Purchase from ${o.sellerShop.name}`}
      />
      <BulkOrderActions id={o.id} side={side} status={o.status} fulfilment={o.fulfilment} paymentMethod={o.paymentMethod} total={o.total} />
      <BulkOrderView o={o} side={side} />
    </div>
  );
}
