import { db } from "@/server/db";
import { getSettings } from "@/server/services/settings";
import { PageHeader } from "@/components/shared/misc";
import { ShopForm } from "../shop-form";

export const metadata = { title: "Onboard shop" };

export default async function NewShopPage() {
  const [categories, owners, settings] = await Promise.all([
    db.category.findMany({ where: { deletedAt: null }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    db.shopOwner.findMany({ where: { user: { deletedAt: null, status: "ACTIVE" } }, include: { user: true } }),
    getSettings(),
  ]);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader back={{ href: "/admin/shops", label: "Shops" }} title="Onboard a new shop" description="Create the shop profile. You can activate it after assigning an owner." />
      <ShopForm categories={categories} owners={owners.map((o) => ({ id: o.id, name: o.user.name ?? "—", email: o.user.email ?? "" }))} defaultCommission={settings.commission.defaultBps / 100} />
    </div>
  );
}
