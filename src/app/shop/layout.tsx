import { redirect } from "next/navigation";
import { Store } from "lucide-react";
import { getSessionUser } from "@/server/auth/session";
import { activeShopFor } from "@/server/services/inventory";
import { AppError } from "@/server/errors";
import { EmptyState } from "@/components/shared/misc";
import { ShopChrome } from "./shop-chrome";

export const dynamic = "force-dynamic";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user || user.role !== "SHOP_OWNER") redirect("/login/staff?next=/shop");
  let ctx;
  try {
    ctx = await activeShopFor(user);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) {
      return (
        <div className="p-6">
          <EmptyState icon={Store} title="No shop assigned yet" description="Your account is active, but the administrator hasn't assigned a shop to you. Please contact support." />
        </div>
      );
    }
    throw e;
  }
  const { shop, shops } = ctx;
  return (
    <ShopChrome
      shop={{ id: shop.id, name: shop.name, acceptingOrders: shop.acceptingOrders, isActive: shop.isActive, approvalStatus: shop.approvalStatus }}
      shops={shops.map((s) => ({ id: s.id, name: s.name }))}
      ownerName={user.name ?? "Owner"}
    >
      {children}
    </ShopChrome>
  );
}
