import Link from "next/link";
import { db } from "@/server/db";

export const metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const categories = await db.category.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { sortOrder: "asc" },
    include: { subcategories: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } },
  });
  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold">All categories</h1>
      {categories.map((c) => (
        <section key={c.id}>
          <Link href={`/search?category=${c.slug}`} className="mb-3 flex items-center gap-3">
            <div className="size-10 overflow-hidden rounded-xl bg-secondary">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {c.imageUrl && <img src={c.imageUrl} alt="" className="size-full object-cover" />}
            </div>
            <h2 className="text-lg font-bold">{c.name}</h2>
          </Link>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
            {c.subcategories.map((s) => (
              <Link key={s.id} href={`/search?category=${c.slug}&sub=${s.slug}`} className="rounded-xl border bg-card p-3 text-center text-xs font-semibold hover:border-primary">
                {s.name}
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
