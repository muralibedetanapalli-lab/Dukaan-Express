import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/server/db";
import { getSettings } from "@/server/services/settings";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, ProductThumb } from "@/components/shared/misc";
import { Pill } from "@/components/shared/status-badge";
import { FilterBar } from "@/components/admin/filter-bar";
import { ActionButton } from "@/components/admin/action-button";
import { bpsToPercent } from "@/lib/money";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Shops" };

export default async function AdminShopsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const settings = await getSettings();
  const where: Prisma.ShopWhereInput = {
    deletedAt: null,
    ...(sp.approval ? { approvalStatus: sp.approval as "PENDING" | "APPROVED" | "REJECTED" } : {}),
    ...(sp.active ? { isActive: sp.active === "true" } : {}),
    ...(sp.q ? { OR: [{ name: { contains: sp.q, mode: "insensitive" } }, { address: { city: { contains: sp.q, mode: "insensitive" } } }, { address: { pincode: { contains: sp.q } } }] } : {}),
  };
  const shops = await db.shop.findMany({
    where,
    orderBy: [{ approvalStatus: "asc" }, { createdAt: "desc" }],
    include: { address: true, category: true, owner: { include: { user: { select: { name: true } } } }, _count: { select: { inventory: true, orders: true } } },
  });

  return (
    <div>
      <PageHeader
        title="Shops"
        description={`${shops.length} shops · default commission ${bpsToPercent(settings.commission.defaultBps)}`}
        actions={
          <Button asChild>
            <Link href="/admin/shops/new">
              <Plus /> Onboard shop
            </Link>
          </Button>
        }
      />
      <FilterBar
        basePath="/admin/shops"
        filters={[
          { key: "q", label: "Name, city or pincode", type: "search" },
          { key: "approval", label: "Approval", type: "select", options: ["PENDING", "APPROVED", "REJECTED"].map((v) => ({ value: v, label: v.toLowerCase() })) },
          { key: "active", label: "Status", type: "select", options: [{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }] },
        ]}
      />
      <Card className="gap-0 overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Shop</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="text-right">Radius</TableHead>
              <TableHead className="text-right">Commission</TableHead>
              <TableHead className="text-right">Products</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {shops.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <Link href={`/admin/shops/${s.id}`} className="flex items-center gap-2">
                    <ProductThumb src={s.logoUrl} alt="" className="size-9" />
                    <span>
                      <span className="block font-semibold text-primary hover:underline">{s.name}</span>
                      <span className="text-xs text-muted-foreground">{s.category?.name}</span>
                    </span>
                  </Link>
                </TableCell>
                <TableCell>{s.owner?.user.name ?? <span className="text-xs text-destructive">Unassigned</span>}</TableCell>
                <TableCell className="text-xs">
                  {s.address?.city} {s.address?.pincode}
                </TableCell>
                <TableCell className="text-right">{s.deliveryRadiusKm} km</TableCell>
                <TableCell className="text-right">{bpsToPercent(s.commissionBps ?? settings.commission.defaultBps)}</TableCell>
                <TableCell className="text-right">{s._count.inventory}</TableCell>
                <TableCell className="text-right">{s._count.orders}</TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <Pill tone={s.approvalStatus === "APPROVED" ? "success" : s.approvalStatus === "PENDING" ? "warning" : "danger"}>{s.approvalStatus.toLowerCase()}</Pill>
                    {s.approvalStatus === "APPROVED" && <Pill tone={s.isActive ? "primary" : "neutral"}>{s.isActive ? "active" : "inactive"}</Pill>}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  {s.approvalStatus === "PENDING" ? (
                    <ActionButton path={`/admin/shops/${s.id}/actions`} body={{ action: "approve" }} success="Shop approved">
                      Approve
                    </ActionButton>
                  ) : s.approvalStatus === "APPROVED" ? (
                    <ActionButton
                      path={`/admin/shops/${s.id}/actions`}
                      body={{ action: s.isActive ? "deactivate" : "activate" }}
                      variant="outline"
                      success={s.isActive ? "Shop deactivated" : "Shop activated"}
                    >
                      {s.isActive ? "Deactivate" : "Activate"}
                    </ActionButton>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
