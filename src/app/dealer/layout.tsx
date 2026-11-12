import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { DealerChrome } from "./dealer-chrome";

export const dynamic = "force-dynamic";

export default async function DealerLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user || user.role !== "DEALER" || !user.dealerId) redirect("/login/staff?next=/dealer");
  const [regions, pending] = await Promise.all([
    db.serviceArea.findMany({ where: { dealerId: user.dealerId }, orderBy: { city: "asc" }, select: { city: true } }),
    db.shopSettlement.count({ where: { status: "DEALER_REVIEW", shop: { dealerId: user.dealerId } } }),
  ]);
  return (
    <DealerChrome name={user.name ?? "Dealer"} regions={regions.map((r) => r.city)} pending={pending}>
      {children}
    </DealerChrome>
  );
}
