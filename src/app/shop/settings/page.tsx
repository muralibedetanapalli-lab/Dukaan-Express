import { getSessionUser } from "@/server/auth/session";
import { activeShopFor } from "@/server/services/inventory";
import { PageHeader } from "@/components/shared/misc";
import { ShopSettingsClient } from "./settings-client";

export const metadata = { title: "Shop settings" };

export default async function ShopSettingsPage() {
  const user = (await getSessionUser())!;
  const { shop } = await activeShopFor(user);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Shop settings" description="Operating hours, preparation time and account security. Contact the admin to change address, radius or commission." />
      <ShopSettingsClient
        shop={{
          name: shop.name,
          avgPrepMinutes: shop.avgPrepMinutes,
          deliveryRadiusKm: shop.deliveryRadiusKm,
          address: shop.address ? `${shop.address.line1}, ${shop.address.city} ${shop.address.pincode}` : "—",
          hours: shop.hours.map((h) => ({ dayOfWeek: h.dayOfWeek, openTime: h.openTime, closeTime: h.closeTime, isClosed: h.isClosed })),
        }}
      />
    </div>
  );
}
