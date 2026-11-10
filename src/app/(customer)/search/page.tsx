import { MapPinOff, SearchX } from "lucide-react";
import { db } from "@/server/db";
import { readLocationCookie } from "@/server/services/location";
import { browseProducts, type SortKey } from "@/server/services/catalog";
import { ProductGrid } from "@/components/customer/product-card";
import { EmptyState } from "@/components/shared/misc";
import { Pagination } from "@/components/shared/pagination";
import { SearchFilters } from "./filters";

export const dynamic = "force-dynamic";
export const metadata = { title: "Search" };

const SORTS: SortKey[] = ["relevance", "price_asc", "price_desc", "discount", "newest", "eta"];

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const loc = await readLocationCookie();
  const categories = await db.category.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { sortOrder: "asc" },
    include: { subcategories: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } },
  });
  const category = categories.find((c) => c.slug === sp.category);
  const sub = category?.subcategories.find((s) => s.slug === sp.sub);
  const sort = SORTS.includes(sp.sort as SortKey) ? (sp.sort as SortKey) : undefined;
  const page = Math.max(1, Number(sp.page) || 1);

  if (!loc) return <EmptyState icon={MapPinOff} title="Set your delivery location" description="We need your location to show products from nearby shops." />;

  const res = await browseProducts({ lat: loc.lat, lng: loc.lng }, { q: sp.q, categoryId: category?.id, subcategoryId: sub?.id, sort, page, pageSize: 30 });

  return (
    <div>
      <h1 className="text-xl font-bold">
        {sp.q ? <>Results for &ldquo;{sp.q}&rdquo;</> : sub ? sub.name : category ? category.name : "All products"}
      </h1>
      <p className="text-sm text-muted-foreground">
        {res.total} product{res.total === 1 ? "" : "s"} from {res.shops.filter((s) => s.orderable).length} shops near {loc.label}
      </p>
      <SearchFilters
        categories={categories.map((c) => ({ slug: c.slug, name: c.name, subs: c.subcategories.map((s) => ({ slug: s.slug, name: s.name })) }))}
        current={{ category: sp.category, sub: sp.sub, sort: sort ?? (sp.q ? "relevance" : "eta"), q: sp.q }}
      />
      {res.items.length ? (
        <>
          <ProductGrid items={res.items} />
          <Pagination page={res.page} pageSize={res.pageSize} total={res.total} basePath="/search" params={{ q: sp.q, category: sp.category, sub: sp.sub, sort: sp.sort }} />
        </>
      ) : (
        <EmptyState icon={SearchX} title="No products found" description="Try a different search term or category." className="mt-6" />
      )}
    </div>
  );
}
