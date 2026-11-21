import { notFound } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { activeShopFor } from "@/server/services/inventory";
import { wholesalerCatalog } from "@/server/services/bulk";
import { AppError } from "@/server/errors";
import { PageHeader } from "@/components/shared/misc";
import { BulkCart } from "./bulk-cart";

export const metadata = { title: "Wholesaler" };
export const dynamic = "force-dynamic";

export default async function WholesalerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await getSessionUser())!;
  const { shop } = await activeShopFor(user);
  let cat;
  try {
    cat = await wholesalerCatalog(shop.id, id);
  } catch (e) {
    if (e instanceof AppError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }
  return (
    <div>
      <PageHeader back={{ href: "/shop/bulk", label: "Wholesalers" }} title={cat.shop.name} description={cat.shop.address} />
      <BulkCart shop={cat.shop} items={cat.items} buyerLive={shop.isActive && !!shop.agreementAcceptedAt} />
    </div>
  );
}
