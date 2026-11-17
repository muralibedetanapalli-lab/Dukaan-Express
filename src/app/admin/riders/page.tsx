import { db } from "@/server/db";
import { riderRows } from "@/server/services/rider-list";
import { PageHeader } from "@/components/shared/misc";
import { AddRiderButton } from "@/components/shared/rider-dialog";
import { RidersTable } from "@/components/shared/riders-table";

export const metadata = { title: "Riders" };

export default async function AdminRidersPage() {
  const [rows, dealers] = await Promise.all([
    riderRows({}),
    db.dealer.findMany({ where: { user: { deletedAt: null, status: "ACTIVE" } }, select: { id: true, user: { select: { name: true } } } }),
  ]);
  const online = rows.filter((r) => r.online && r.status === "ACTIVE").length;
  return (
    <div>
      <PageHeader
        title="Riders"
        description={`${rows.length} riders · ${online} online. Dealers usually add their own riders; withdrawals go to the rider's dealer first, then to you in Commission & payouts.`}
        actions={<AddRiderButton endpoint="/admin/riders" dealers={dealers.map((d) => ({ id: d.id, name: d.user.name ?? "Dealer" }))} />}
      />
      <RidersTable rows={rows} base="/admin/riders" showDealer />
    </div>
  );
}
