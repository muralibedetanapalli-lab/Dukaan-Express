import Link from "next/link";
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
        <Card className="p-6 text-sm">
          You don&apos;t have a region yet, so you can&apos;t onboard shops. Ask the platform admin to assign one.{" "}
          <Link href="/dealer" className="font-medium text-primary hover:underline">
            Back to home
          </Link>
        </Card>
      ) : (
        <>
          <Card className="mb-4 gap-1 p-4 text-sm">
            <p className="font-medium">Your regions</p>
            {regions.map((r) => (
              <p key={r.city} className="text-muted-foreground">
                <b className="text-foreground">{r.city}</b>
                {r.pincodes.length ? ` — pincodes ${r.pincodes.join(", ")}` : " — any pincode in the city"}
              </p>
            ))}
          </Card>
          <ShopForm mode="dealer" categories={categories} owners={[]} defaultCommission={settings.commission.defaultBps / 100} />
        </>
      )}
    </div>
  );
}
