import Link from "next/link";
import { Plus } from "lucide-react";
import { getSessionUser } from "@/server/auth/session";
import { activeShopFor, listInventory } from "@/server/services/inventory";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/misc";
import { Pagination } from "@/components/shared/pagination";
import { InventoryList } from "./inventory-list";

export const metadata = { title: "Inventory" };

const FILTERS = ["all", "low", "out", "unavailable"] as const;

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ filter?: string; q?: string; page?: string }> }) {
  const sp = await searchParams;
  const user = (await getSessionUser())!;
  const { shop } = await activeShopFor(user);
  const filter = (FILTERS as readonly string[]).includes(sp.filter ?? "") ? (sp.filter as (typeof FILTERS)[number]) : "all";
  const page = Math.max(1, Number(sp.page) || 1);
  const res = await listInventory(shop.id, { search: sp.q, filter, page, pageSize: 50 });

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Prices and stock are specific to your shop."
        actions={
          <Button asChild>
            <Link href="/shop/inventory/new">
              <Plus /> Add product
            </Link>
          </Button>
        }
      />
      <InventoryList
        filter={filter}
        q={sp.q ?? ""}
        items={res.items.map((i) => ({
          id: i.id,
          name: i.product.name,
          variant: i.variant?.name ?? null,
          category: i.product.category.name,
          imageUrl: i.product.images[0]?.url ?? null,
          sku: i.shopSku ?? i.product.sku,
          mrp: i.mrp,
          price: i.sellingPrice,
          stock: i.stock,
          low: i.stock <= i.lowStockThreshold,
          isAvailable: i.isAvailable,
          approval: i.product.approvalStatus,
        }))}
      />
      <Pagination page={res.page} pageSize={res.pageSize} total={res.total} basePath="/shop/inventory" params={{ filter, q: sp.q }} />
    </div>
  );
}
