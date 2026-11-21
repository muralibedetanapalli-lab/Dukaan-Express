import { MapPin } from "lucide-react";
import { getSessionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getSettings } from "@/server/services/settings";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/misc";
import { ShopForm } from "@/app/admin/shops/shop-form";

export const metadata = { title: "Onboard a shop" };

export default async function DealerNewShopPage() {
  const user = (await getSessionUser())!;
  const [categories, regions, settings] = await Promise.all([
    db.category.findMany({ where: { deletedAt: null }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    db.serviceArea.findMany({ where: { dealerId: user.dealerId! }, orderBy: { city: "asc" }, select: { city: true, pincodes: true } }),
    getSettings(),
  ]);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        back={{ href: "/dealer/shops", label: "My shops" }}
        title="Onboard a shop"
        description="The shop goes live as soon as you save it. The owner can then add products from the Dukaan Partner app."
      />
      {regions.length === 0 ? (
        <Card className="mb-4 flex-row items-start gap-3 border-sky-200 bg-sky-50 p-4 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
          <MapPin className="mt-0.5 size-4 shrink-0" />
          <p>
            <b>Your first shop sets your area.</b> The pincode where you pin this shop becomes your service area, and your next shops must be in it.
            The admin can add more areas for you later.
          </p>
        </Card>
      ) : (
        <Card className="mb-4 gap-1 p-4 text-sm">
          <p className="font-medium">Your area</p>
          {regions.map((r, i) => (
            <p key={i} className="text-muted-foreground">
              <b className="text-foreground">{r.city}</b>
              {r.pincodes.length ? ` · pincode${r.pincodes.length > 1 ? "s" : ""} ${r.pincodes.join(", ")}` : " · any pincode in the city"}
            </p>
          ))}
        </Card>
      )}
      <ShopForm mode="dealer" categories={categories} owners={[]} defaultCommission={settings.commission.defaultBps / 100} />
    </div>
  );
}
