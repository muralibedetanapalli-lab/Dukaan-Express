import { getSessionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { activeShopFor } from "@/server/services/inventory";
import { BulkTabs } from "./bulk-tabs";

export default async function BulkLayout({ children }: { children: React.ReactNode }) {
  const user = (await getSessionUser())!;
  const { shop } = await activeShopFor(user);
  const [incoming, active] = await Promise.all([
    db.bulkOrder.count({ where: { sellerShopId: shop.id, status: "PLACED" } }),
    db.bulkOrder.count({ where: { buyerShopId: shop.id, status: { in: ["PAYMENT_PENDING", "PLACED", "ACCEPTED", "DISPATCHED", "READY_FOR_PICKUP"] } } }),
  ]);
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-700 via-indigo-800 to-slate-900 p-5 text-white sm:p-6">
        <p className="text-xs font-semibold tracking-wider text-indigo-200 uppercase">Shop to shop</p>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Bulk orders</h1>
        <p className="mt-1 max-w-xl text-sm text-indigo-100/90">Buy stock in bulk from wholesalers near you, or sell your own stock in bulk to other shops.</p>
      </div>
      <BulkTabs incoming={incoming} active={active} sells={shop.sellsBulk} />
      {children}
    </div>
  );
}
