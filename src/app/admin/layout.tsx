import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { integrationModes } from "@/server/env";
import { db } from "@/server/db";
import { AdminChrome } from "./admin-chrome";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user || user.role !== "SUPER_ADMIN") redirect("/login/staff?next=/admin");
  const [pendingShops, exceptions, openTickets, pendingMods] = await Promise.all([
    db.shop.count({ where: { approvalStatus: "PENDING", deletedAt: null } }),
    db.shipment.count({ where: { status: "EXCEPTION" } }),
    db.supportTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    db.orderModification.count({ where: { status: "PENDING" } }),
  ]);
  const modes = integrationModes();
  return (
    <AdminChrome
      userName={user.name ?? "Admin"}
      badges={{ shops: pendingShops, shipments: exceptions, support: openTickets, orders: pendingMods }}
      sandbox={Object.entries(modes)
        .filter(([, m]) => m === "mock")
        .map(([k]) => k)}
    >
      {children}
    </AdminChrome>
  );
}
