import Link from "next/link";
import { BadgeCheck, IndianRupee, MapPin, Plus, Store } from "lucide-react";
import { getSessionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { dealerBalance } from "@/server/services/dealer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader, StatCard } from "@/components/shared/misc";
import { bpsToPercent, formatINR } from "@/lib/money";
import { PendingPayoutReviews } from "./payout-list";
import { PendingRiderWithdrawals } from "./rider-withdrawals";

export const metadata = { title: "Dealer home" };

export default async function DealerHome() {
  const user = (await getSessionUser())!;
  const dealerId = user.dealerId!;
  const [dealer, shops, live, pending, balance, regions] = await Promise.all([
    db.dealer.findUniqueOrThrow({ where: { id: dealerId } }),
    db.shop.count({ where: { dealerId, deletedAt: null } }),
    db.shop.count({ where: { dealerId, deletedAt: null, isActive: true, approvalStatus: "APPROVED" } }),
    db.shopSettlement.count({ where: { status: "DEALER_REVIEW", shop: { dealerId } } }).then(async (n) => n + (await db.riderWithdrawal.count({ where: { status: "DEALER_REVIEW", rider: { dealerId } } }))),
    dealerBalance(dealerId),
    db.serviceArea.findMany({ where: { dealerId }, orderBy: { city: "asc" }, select: { id: true, city: true, state: true, pincodes: true } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hello, ${user.name?.split(" ")[0] ?? "Dealer"}`}
        description={`You earn ${bpsToPercent(dealer.commissionShareBps)} of the platform commission on every delivered order from your shops.`}
        actions={
          <Button asChild>
            <Link href="/dealer/shops/new">
              <Plus /> Onboard a shop
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="My shops" value={shops} hint={`${live} live`} icon={Store} tone="primary" href="/dealer/shops" />
        <StatCard label="To approve" value={pending} hint="shop & rider payouts" icon={BadgeCheck} tone={pending ? "warning" : "default"} href="/dealer/payouts" />
        <StatCard label="My earnings" value={formatINR(balance.amount)} hint={`from ${balance.orders} orders`} icon={IndianRupee} tone="success" href="/dealer/earnings" />
        <StatCard label="Regions" value={regions.length} hint={regions.map((r) => (r.pincodes.length ? `${r.city} ${r.pincodes.join(", ")}` : r.city)).join("; ") || "set by your first shop"} icon={MapPin} />
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Payout requests to approve</h2>
          {pending > 3 && (
            <Link href="/dealer/payouts" className="text-sm font-medium text-primary hover:underline">
              View all {pending}
            </Link>
          )}
        </div>
        <PendingPayoutReviews dealerId={dealerId} limit={3} />
        <PendingRiderWithdrawals dealerId={dealerId} limit={3} />
      </section>

      {regions.length === 0 && (
        <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          You don&apos;t have an area yet. <b>Onboard your first shop</b> and its pincode becomes your service area.
        </Card>
      )}
    </div>
  );
}
