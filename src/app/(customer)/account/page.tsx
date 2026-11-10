import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { AccountClient } from "./account-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "My account" };

export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user?.customerId) redirect("/login?next=/account");
  const [addresses, tickets] = await Promise.all([
    db.customerAddress.findMany({ where: { customerId: user.customerId, deletedAt: null }, orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }] }),
    db.supportTicket.findMany({ where: { customerId: user.customerId }, orderBy: { createdAt: "desc" }, include: { order: { select: { orderNumber: true } } } }),
  ]);
  return (
    <AccountClient
      user={{ name: user.name, email: user.email, phone: user.phone }}
      addresses={addresses}
      tickets={tickets.map((t) => ({ id: t.id, ticketNumber: t.ticketNumber, subject: t.subject, status: t.status, resolution: t.resolution, orderNumber: t.order?.orderNumber ?? null, createdAt: t.createdAt.toISOString() }))}
    />
  );
}
