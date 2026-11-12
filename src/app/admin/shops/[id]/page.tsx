import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { getSettings } from "@/server/services/settings";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, StatCard } from "@/components/shared/misc";
import { OrderStatusBadge, Pill } from "@/components/shared/status-badge";
import { ActionButton } from "@/components/admin/action-button";
import { bpsToPercent, formatINR, toRupees } from "@/lib/money";
import { fmtDateTime } from "@/lib/format";
import { ShopForm } from "../shop-form";
import { regionFor } from "@/server/services/dealer";
import { ShopDealerCard } from "./shop-dealer";

export const dynamic = "force-dynamic";

export default async function AdminShopPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shop = await db.shop.findFirst({
    where: { id, deletedAt: null },
    include: {
      address: true,
      hours: { orderBy: { dayOfWeek: "asc" } },
      images: { orderBy: { sortOrder: "asc" } },
      category: true,
      owner: { include: { user: true } },
    },
  });
  if (!shop) notFound();
  const [settings, categories, owners, perf, delivered, rejected, inventory, orders, dealers, areas] = await Promise.all([
    getSettings(),
    db.category.findMany({ where: { deletedAt: null }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    db.shopOwner.findMany({ where: { user: { deletedAt: null } }, include: { user: true } }),
    db.order.aggregate({
      where: { shopId: id, status: { notIn: ["CANCELLED", "SHOP_REJECTED", "PAYMENT_PENDING", "CREATED"] } },
      _sum: { total: true, commissionAmount: true, shopEarning: true },
      _count: true,
    }),
    db.order.count({ where: { shopId: id, status: "DELIVERED" } }),
    db.order.count({ where: { shopId: id, status: "SHOP_REJECTED" } }),
    db.shopInventory.findMany({ where: { shopId: id, deletedAt: null }, include: { product: { include: { category: true } }, variant: true }, orderBy: { updatedAt: "desc" } }),
    db.order.findMany({ where: { shopId: id }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.dealer.findMany({ where: { user: { deletedAt: null, status: "ACTIVE" } }, include: { user: { select: { name: true } }, regions: { select: { city: true } } } }),
    db.serviceArea.findMany({ where: { dealerId: { not: null } }, select: { id: true, city: true, pincodes: true, dealerId: true } }),
  ]);
  const regionDealer = shop.address ? (regionFor(areas, shop.address) as (typeof areas)[number] | null)?.dealerId ?? null : null;
  const a = shop.address;

  return (
    <div className="space-y-5">
      <PageHeader
        back={{ href: "/admin/shops", label: "Shops" }}
        title={shop.name}
        description={`${shop.category?.name ?? "Uncategorised"} · ${a?.city ?? ""} ${a?.pincode ?? ""} · Owner: ${shop.owner?.user.name ?? "unassigned"}`}
        actions={
          <>
            <Pill tone={shop.approvalStatus === "APPROVED" ? "success" : shop.approvalStatus === "PENDING" ? "warning" : "danger"}>{shop.approvalStatus.toLowerCase()}</Pill>
            {shop.approvalStatus !== "APPROVED" && (
              <ActionButton path={`/admin/shops/${id}/actions`} body={{ action: "approve" }} success="Shop approved">
                Approve
              </ActionButton>
            )}
            {shop.approvalStatus === "PENDING" && (
              <ActionButton path={`/admin/shops/${id}/actions`} body={{ action: "reject" }} requireReason variant="outline" destructive confirm={{ title: "Reject shop registration?", label: "Reject" }} success="Shop rejected">
                Reject
              </ActionButton>
            )}
            {shop.approvalStatus === "APPROVED" && (
              <ActionButton
                path={`/admin/shops/${id}/actions`}
                body={{ action: shop.isActive ? "deactivate" : "activate" }}
                variant={shop.isActive ? "outline" : "default"}
                confirm={shop.isActive ? { title: "Deactivate this shop?", description: "It will disappear from the customer app immediately and carts will be cleared.", label: "Deactivate" } : undefined}
                success={shop.isActive ? "Deactivated" : "Activated"}
              >
                {shop.isActive ? "Deactivate" : "Activate"}
              </ActionButton>
            )}
          </>
        }
      />
      <ShopDealerCard
        shopId={id}
        dealerId={shop.dealerId}
        suggested={regionDealer}
        dealers={dealers.map((d) => ({ id: d.id, name: d.user.name ?? "Dealer", regions: d.regions.map((r) => r.city).join(", ") }))}
      />
      {shop.rejectionReason && shop.approvalStatus === "REJECTED" && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">Rejected: {shop.rejectionReason}</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Orders" value={perf._count} />
        <StatCard label="Delivered" value={delivered} />
        <StatCard label="Acceptance" value={perf._count ? `${Math.round(((perf._count - rejected) / perf._count) * 100)}%` : "—"} />
        <StatCard label="Sales" value={formatINR(perf._sum.total ?? 0, { compact: true })} />
        <StatCard label="Commission" value={formatINR(perf._sum.commissionAmount ?? 0, { compact: true })} hint={bpsToPercent(shop.commissionBps ?? settings.commission.defaultBps)} />
        <StatCard label="Rating" value={shop.ratingCount ? `★ ${shop.rating.toFixed(1)}` : "—"} hint={`${shop.ratingCount} reviews`} />
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="inventory">Inventory ({inventory.length})</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
        </TabsList>
        <TabsContent value="details" className="mt-4">
          <ShopForm
            categories={categories}
            owners={owners.map((o) => ({ id: o.id, name: o.user.name ?? "—", email: o.user.email ?? "" }))}
            defaultCommission={settings.commission.defaultBps / 100}
            initial={{
              id: shop.id,
              name: shop.name,
              description: shop.description ?? "",
              categoryId: shop.categoryId ?? "",
              ownerId: shop.ownerId ?? "",
              contactPhone: shop.contactPhone,
              contactEmail: shop.contactEmail ?? "",
              gstNumber: shop.gstNumber ?? "",
              logoUrl: shop.logoUrl,
              images: shop.images.map((i) => i.url),
              deliveryRadiusKm: String(shop.deliveryRadiusKm),
              commissionPercent: shop.commissionBps == null ? "" : String(shop.commissionBps / 100),
              avgPrepMinutes: String(shop.avgPrepMinutes),
              address: {
                line1: a?.line1 ?? "",
                line2: a?.line2 ?? "",
                landmark: a?.landmark ?? "",
                city: a?.city ?? "",
                state: a?.state ?? "",
                pincode: a?.pincode ?? "",
                latitude: a ? String(a.latitude) : "",
                longitude: a ? String(a.longitude) : "",
              },
              hours: Array.from({ length: 7 }, (_, d) => shop.hours.find((h) => h.dayOfWeek === d) ?? { dayOfWeek: d, openTime: "07:00", closeTime: "23:00", isClosed: false }).map((h) => ({
                dayOfWeek: h.dayOfWeek,
                openTime: h.openTime,
                closeTime: h.closeTime,
                isClosed: h.isClosed,
              })),
            }}
          />
          {shop.pickupLocationName && <p className="mt-3 text-xs text-muted-foreground">Shiprocket pickup location: {shop.pickupLocationName}</p>}
        </TabsContent>
        <TabsContent value="inventory" className="mt-4">
          <Card className="gap-0 overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">MRP</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead>Availability</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventory.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      {i.product.name}
                      {i.variant ? ` · ${i.variant.name}` : ""}
                    </TableCell>
                    <TableCell className="text-xs">{i.product.category.name}</TableCell>
                    <TableCell className="text-right">₹{toRupees(i.mrp)}</TableCell>
                    <TableCell className="text-right font-semibold">₹{toRupees(i.sellingPrice)}</TableCell>
                    <TableCell className={`text-right ${i.stock <= i.lowStockThreshold ? "font-semibold text-destructive" : ""}`}>{i.stock}</TableCell>
                    <TableCell>
                      <Pill tone={i.isAvailable ? "success" : "neutral"}>{i.isAvailable ? "available" : "unavailable"}</Pill>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
        <TabsContent value="orders" className="mt-4">
          <Card className="gap-0 overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Placed</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Shop earning</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <Link href={`/admin/orders/${o.id}`} className="font-semibold text-primary hover:underline">
                        {o.orderNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs">{fmtDateTime(o.createdAt)}</TableCell>
                    <TableCell>
                      <OrderStatusBadge status={o.status} />
                    </TableCell>
                    <TableCell className="text-right">{formatINR(o.total)}</TableCell>
                    <TableCell className="text-right">{formatINR(o.shopEarning)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
