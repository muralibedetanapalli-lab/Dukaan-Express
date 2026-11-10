import { db } from "@/server/db";
import { PageHeader } from "@/components/shared/misc";
import { CategoryManager } from "./category-manager";

export const metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const categories = await db.category.findMany({
    where: { deletedAt: null },
    orderBy: { sortOrder: "asc" },
    include: { subcategories: { orderBy: { sortOrder: "asc" } }, _count: { select: { products: true } } },
  });
  return (
    <div>
      <PageHeader title="Categories" description="Product categories, subcategories, images and GST rates" />
      <CategoryManager
        categories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          imageUrl: c.imageUrl,
          taxRateBps: c.taxRateBps,
          sortOrder: c.sortOrder,
          isActive: c.isActive,
          productCount: c._count.products,
          subcategories: c.subcategories.map((s) => ({ id: s.id, name: s.name, isActive: s.isActive, sortOrder: s.sortOrder, imageUrl: s.imageUrl })),
        }))}
      />
    </div>
  );
}
