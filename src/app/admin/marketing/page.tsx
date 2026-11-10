import { db } from "@/server/db";
import { PageHeader } from "@/components/shared/misc";
import { MarketingClient } from "./marketing-client";

export const metadata = { title: "Coupons & banners" };

export default async function MarketingPage() {
  const [coupons, banners, shops] = await Promise.all([
    db.coupon.findMany({ orderBy: { createdAt: "desc" }, include: { shop: { select: { name: true } } } }),
    db.banner.findMany({ orderBy: { sortOrder: "asc" } }),
    db.shop.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div>
      <PageHeader title="Coupons & banners" description="Promotions shown in the customer app" />
      <MarketingClient
        shops={shops}
        coupons={coupons.map((c) => ({ ...c, shopName: c.shop?.name ?? null, validFrom: c.validFrom.toISOString(), validTo: c.validTo?.toISOString() ?? null, shop: undefined, createdAt: undefined, updatedAt: undefined }))}
        banners={banners.map((b) => ({ ...b, startsAt: b.startsAt?.toISOString() ?? null, endsAt: b.endsAt?.toISOString() ?? null, createdAt: undefined, updatedAt: undefined }))}
      />
    </div>
  );
}
