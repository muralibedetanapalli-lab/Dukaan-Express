import { redirect } from "next/navigation";
import { Store } from "lucide-react";
import { getSessionUser } from "@/server/auth/session";
import { activeShopFor } from "@/server/services/inventory";
import { AppError } from "@/server/errors";
import { EmptyState } from "@/components/shared/misc";
import { ShopChrome } from "./shop-chrome";
import { AgreementPending } from "./agreement-pending";
import { db } from "@/server/db";

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
  // Until the owner signs the seller agreement (emailed at onboarding) the panel shows only how to sign it.
  const pending = shop.agreementAcceptedAt
    ? null
    : await db.shopAgreement.findFirst({ where: { shopId: shop.id, status: "PENDING" }, orderBy: { createdAt: "desc" }, select: { sentTo: true } });
  return (
    <ShopChrome
      shop={{ id: shop.id, name: shop.name, acceptingOrders: shop.acceptingOrders, isActive: shop.isActive, approvalStatus: shop.approvalStatus, agreementSigned: !!shop.agreementAcceptedAt }}
      shops={shops.map((s) => ({ id: s.id, name: s.name }))}
      ownerName={user.name ?? "Owner"}
    >
      {shop.agreementAcceptedAt ? children : <AgreementPending shopId={shop.id} shopName={shop.name} sentTo={pending?.sentTo ?? null} />}
    </ShopChrome>
  );
}
