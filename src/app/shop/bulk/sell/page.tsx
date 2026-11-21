import { getSessionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { activeShopFor } from "@/server/services/inventory";
import { getSettings } from "@/server/services/settings";
import { unitLabel } from "@/lib/format";
import { SellBulkClient } from "./sell-client";

export const metadata = { title: "Sell in bulk" };
export const dynamic = "force-dynamic";

export default async function SellBulkPage() {
  const user = (await getSessionUser())!;
  const { shop } = await activeShopFor(user);
  const [items, settings] = await Promise.all([
    db.shopInventory.findMany({
      where: { shopId: shop.id, deletedAt: null },
      include: { product: { include: { images: { orderBy: { sortOrder: "asc" }, take: 1 } } }, variant: true },
      orderBy: { product: { name: "asc" } },
    }),
    getSettings(),
  ]);
  return (
    <SellBulkClient
      commissionBps={settings.commission.b2bBps}
      settings={{
        sellsBulk: shop.sellsBulk,
        bulkMinOrder: shop.bulkMinOrder,
        bulkDelivers: shop.bulkDelivers,
        bulkDeliveryFee: shop.bulkDeliveryFee,
        bulkPickup: shop.bulkPickup,
        bulkPayOnDelivery: shop.bulkPayOnDelivery,
      }}
      items={items.map((i) => ({
        id: i.id,
        name: i.product.name,
        variant: i.variant?.name ?? unitLabel(i.product.unit, i.product.unitValue),
        image: i.product.images[0]?.url ?? null,
        mrp: i.mrp,
        sellingPrice: i.sellingPrice,
        stock: i.stock,
        bulkPrice: i.bulkPrice,
        bulkMinQty: i.bulkMinQty,
      }))}
    />
  );
}
