import { notFound } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { activeShopFor } from "@/server/services/inventory";
import { PageHeader } from "@/components/shared/misc";
import { toRupees } from "@/lib/money";
import { InventoryForm } from "../inventory-form";

export const metadata = { title: "Edit product" };

export default async function EditInventoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await getSessionUser())!;
  const { shop } = await activeShopFor(user);
  const item = await db.shopInventory.findFirst({
    where: { id, shopId: shop.id, deletedAt: null },
    include: { product: { include: { images: { orderBy: { sortOrder: "asc" } } } }, variant: true },
  });
  if (!item) notFound();
  const p = item.product;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={{ href: "/shop/inventory", label: "Inventory" }} title={`${p.name}${item.variant ? ` · ${item.variant.name}` : ""}`} />
      <InventoryForm
        initial={{
          id: item.id,
          productId: p.id,
          canEditProduct: p.createdByShopId === shop.id,
          product: {
            name: p.name,
            description: p.description ?? "",
            brand: p.brand ?? "",
            categoryId: p.categoryId,
            subcategoryId: p.subcategoryId ?? "",
            sku: p.sku ?? "",
            barcode: p.barcode ?? "",
            unit: p.unit,
            unitValue: p.unitValue?.toString() ?? "",
            weightGrams: String(p.weightGrams),
            lengthCm: String(p.lengthCm),
            breadthCm: String(p.breadthCm),
            heightCm: String(p.heightCm),
            images: p.images.map((i) => i.url),
          },
          variantName: item.variant?.name ?? "",
          shopSku: item.shopSku ?? "",
          mrp: String(toRupees(item.mrp)),
          sellingPrice: String(toRupees(item.sellingPrice)),
          stock: String(item.stock),
          lowStockThreshold: String(item.lowStockThreshold),
          maxPerOrder: String(item.maxPerOrder),
          isAvailable: item.isAvailable,
        }}
      />
    </div>
  );
}
