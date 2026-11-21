import { notFound } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { bulkOrderFor } from "@/server/services/bulk";
import { AppError } from "@/server/errors";
import { PageHeader } from "@/components/shared/misc";
import { BulkOrderView } from "@/components/shared/bulk-order-view";

export const metadata = { title: "Bulk order" };
export const dynamic = "force-dynamic";

export default async function AdminBulkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await getSessionUser())!;
  let r;
  try {
    r = await bulkOrderFor(user, id);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
  const o = r.order;
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader back={{ href: "/admin/bulk-orders", label: "Bulk orders" }} title={o.number} description={`${o.sellerShop.name} → ${o.buyerShop.name}`} />
      <BulkOrderView o={o} side="admin" />
    </div>
  );
}
