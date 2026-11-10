import { db } from "@/server/db";
import { getSettings } from "@/server/services/settings";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, ProductThumb } from "@/components/shared/misc";
import { Pill } from "@/components/shared/status-badge";
import { Pagination } from "@/components/shared/pagination";
import { FilterBar } from "@/components/admin/filter-bar";
import { ActionButton } from "@/components/admin/action-button";
import { formatINR } from "@/lib/money";
import { unitLabel } from "@/lib/format";
import type { Prisma } from "@/generated/prisma/client";
import { RecategoriseSelect } from "./recategorise";

export const metadata = { title: "Products" };

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = 25;
  const where: Prisma.ProductWhereInput = {
    deletedAt: null,
    ...(sp.categoryId ? { categoryId: sp.categoryId } : {}),
    ...(sp.approval ? { approvalStatus: sp.approval as "PENDING" | "APPROVED" | "REJECTED" } : {}),
    ...(sp.shopId ? { inventory: { some: { shopId: sp.shopId, deletedAt: null } } } : {}),
    ...(sp.q ? { OR: [{ name: { contains: sp.q, mode: "insensitive" } }, { sku: { contains: sp.q, mode: "insensitive" } }, { brand: { contains: sp.q, mode: "insensitive" } }] } : {}),
  };
  const [products, total, categories, shops, settings] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: [{ approvalStatus: "asc" }, { createdAt: "desc" }],
      include: {
        images: { take: 1, orderBy: { sortOrder: "asc" } },
        category: true,
        subcategory: true,
        inventory: { where: { deletedAt: null }, include: { shop: { select: { name: true } }, variant: true } },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.product.count({ where }),
    db.category.findMany({ where: { deletedAt: null }, include: { subcategories: true }, orderBy: { sortOrder: "asc" } }),
    db.shop.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    getSettings(),
  ]);

  return (
    <div>
      <PageHeader
        title="Products"
        description={`Global product master · moderation ${settings.approvals.productApprovalRequired ? "ON" : "OFF"} (change in Settings)`}
      />
      <FilterBar
        basePath="/admin/products"
        filters={[
          { key: "q", label: "Name, brand or SKU", type: "search" },
          { key: "categoryId", label: "Categories", type: "select", options: categories.map((c) => ({ value: c.id, label: c.name })) },
          { key: "shopId", label: "Shops", type: "select", options: shops.map((s) => ({ value: s.id, label: s.name })) },
          { key: "approval", label: "Approval", type: "select", options: ["PENDING", "APPROVED", "REJECTED"].map((v) => ({ value: v, label: v.toLowerCase() })) },
        ]}
      />
      <Card className="gap-0 overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Availability & prices by shop</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((p) => (
              <TableRow key={p.id} className="align-top">
                <TableCell>
                  <div className="flex items-center gap-2">
                    <ProductThumb src={p.images[0]?.url} alt="" className="size-10 shrink-0" />
                    <div>
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.sku ?? "no SKU"} · {unitLabel(p.unit, p.unitValue)}
                        {p.brand ? ` · ${p.brand}` : ""}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <RecategoriseSelect
                    productId={p.id}
                    categoryId={p.categoryId}
                    subcategoryId={p.subcategoryId}
                    categories={categories.map((c) => ({ id: c.id, name: c.name, subs: c.subcategories.map((s) => ({ id: s.id, name: s.name })) }))}
                  />
                </TableCell>
                <TableCell>
                  {p.inventory.length === 0 ? (
                    <span className="text-xs text-muted-foreground">Not listed by any shop</span>
                  ) : (
                    <ul className="space-y-0.5 text-xs">
                      {p.inventory.map((i) => (
                        <li key={i.id} className={!i.isAvailable || i.stock === 0 ? "text-muted-foreground" : ""}>
                          <b>{i.shop.name}</b>
                          {i.variant ? ` (${i.variant.name})` : ""}: {formatINR(i.sellingPrice)} · stock {i.stock}
                          {!i.isAvailable && " · unavailable"}
                        </li>
                      ))}
                    </ul>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <Pill tone={p.approvalStatus === "APPROVED" ? "success" : p.approvalStatus === "PENDING" ? "warning" : "danger"}>{p.approvalStatus.toLowerCase()}</Pill>
                    {!p.isActive && <Pill>inactive</Pill>}
                  </div>
                </TableCell>
                <TableCell className="space-y-1 text-right">
                  {p.approvalStatus !== "APPROVED" && (
                    <ActionButton path={`/admin/products/${p.id}`} method="PATCH" body={{ approvalStatus: "APPROVED" }} success="Approved">
                      Approve
                    </ActionButton>
                  )}
                  {p.approvalStatus === "PENDING" && (
                    <ActionButton path={`/admin/products/${p.id}`} method="PATCH" body={{ approvalStatus: "REJECTED" }} variant="outline" success="Rejected">
                      Reject
                    </ActionButton>
                  )}
                  <ActionButton path={`/admin/products/${p.id}`} method="PATCH" body={{ isActive: !p.isActive }} variant="ghost" success="Updated">
                    {p.isActive ? "Deactivate" : "Activate"}
                  </ActionButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <Pagination page={page} pageSize={pageSize} total={total} basePath="/admin/products" params={{ q: sp.q, categoryId: sp.categoryId, shopId: sp.shopId, approval: sp.approval }} />
    </div>
  );
}
