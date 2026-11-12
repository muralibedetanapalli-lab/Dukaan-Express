import { notFound } from "next/navigation";
import { CheckCircle2, ClipboardList, IndianRupee, Package } from "lucide-react";
import { getSessionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getBankAccount } from "@/server/services/payout";
import { getSettings } from "@/server/services/settings";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KeyValue, PageHeader, StatCard } from "@/components/shared/misc";
import { OrderStatusBadge, Pill } from "@/components/shared/status-badge";
import { bpsToPercent, formatINR } from "@/lib/money";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { payoutStatus } from "@/lib/payout";

export const metadata = { title: "Shop" };

export default async function DealerShopPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await getSessionUser())!;
  const shop = await db.shop.findFirst({
    where: { id, dealerId: user.dealerId!, deletedAt: null },
    include: { address: true, category: { select: { name: true } }, owner: { include: { user: { select: { name: true, email: true, phone: true, lastLoginAt: true } } } }, _count: { select: { inventory: true } } },
  });
  if (!shop) notFound();
  const [settings, bank, delivered, earned, orders, payouts] = await Promise.all([
    getSettings(),
    getBankAccount(shop.id),
    db.commission.aggregate({ where: { shopId: shop.id }, _sum: { baseAmount: true, shopEarning: true }, _count: true }),
    db.commission.aggregate({ where: { shopId: shop.id, dealerId: user.dealerId! }, _sum: { dealerAmount: true } }),
    db.order.findMany({ where: { shopId: shop.id }, orderBy: { placedAt: "desc" }, take: 10, select: { id: true, orderNumber: true, status: true, total: true, placedAt: true } }),
    db.shopSettlement.findMany({ where: { shopId: shop.id }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const live = shop.isActive && shop.approvalStatus === "APPROVED";

  return (
    <div className="space-y-5">
      <PageHeader
        back={{ href: "/dealer/shops", label: "My shops" }}
        title={shop.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {live ? (shop.acceptingOrders ? <Pill tone="success">Live</Pill> : <Pill tone="warning">Paused by owner</Pill>) : <Pill>Inactive</Pill>}
            {shop.category?.name} · onboarded {fmtDate(shop.createdAt)}
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Delivered orders" value={delivered._count} icon={CheckCircle2} tone="success" />
        <StatCard label="Item sales" value={formatINR(delivered._sum.baseAmount ?? 0)} icon={IndianRupee} tone="primary" />
        <StatCard label="Your earnings" value={formatINR(earned._sum.dealerAmount ?? 0)} hint="from this shop" icon={IndianRupee} />
        <StatCard label="Products" value={shop._count.inventory} icon={Package} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="gap-3 p-5">
          <p className="font-semibold">Owner</p>
          <KeyValue label="Name">{shop.owner?.user.name ?? "—"}</KeyValue>
          <KeyValue label="Login email">{shop.owner?.user.email ?? "—"}</KeyValue>
          <KeyValue label="Mobile">{shop.owner?.user.phone ?? "—"}</KeyValue>
          <KeyValue label="Last login">{shop.owner?.user.lastLoginAt ? fmtDateTime(shop.owner.user.lastLoginAt) : "Never"}</KeyValue>
          <KeyValue label="Payout bank">{bank ? `${bank.accountHolderName} · ${bank.accountNumberMasked} (${bank.ifsc})` : "Not added yet"}</KeyValue>
        </Card>
        <Card className="gap-3 p-5">
          <p className="font-semibold">Shop</p>
          <KeyValue label="Address">
            {shop.address ? `${shop.address.line1}${shop.address.line2 ? `, ${shop.address.line2}` : ""}, ${shop.address.city} ${shop.address.pincode}` : "—"}
          </KeyValue>
          <KeyValue label="Shop mobile">{shop.contactPhone}</KeyValue>
          <KeyValue label="Delivery radius">{shop.deliveryRadiusKm} km</KeyValue>
          <KeyValue label="Platform commission">{bpsToPercent(shop.commissionBps ?? settings.commission.defaultBps)}</KeyValue>
          <KeyValue label="GSTIN">{shop.gstNumber ?? "—"}</KeyValue>
        </Card>
      </div>

      <Card className="gap-0 overflow-hidden p-0">
        <p className="flex items-center gap-2 border-b px-4 py-3 font-semibold">
          <ClipboardList className="size-4" /> Recent orders
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Placed</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                  No orders yet
                </TableCell>
              </TableRow>
            )}
            {orders.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-medium">{o.orderNumber}</TableCell>
                <TableCell className="text-sm">{fmtDateTime(o.placedAt)}</TableCell>
                <TableCell>
                  <OrderStatusBadge status={o.status} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatINR(o.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card className="gap-0 overflow-hidden p-0">
        <p className="border-b px-4 py-3 font-semibold">Payouts</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Requested</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payouts.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                  No payouts yet
                </TableCell>
              </TableRow>
            )}
            {payouts.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="text-sm">{fmtDate(p.createdAt)}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{formatINR(p.netPayable)}</TableCell>
                <TableCell>
                  <Pill tone={payoutStatus(p.status).tone}>{p.status === "DEALER_REVIEW" ? "Waiting for you" : p.status === "PENDING" ? "With admin" : payoutStatus(p.status).label}</Pill>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
