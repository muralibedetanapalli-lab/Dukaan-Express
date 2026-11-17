import { getSessionUser } from "@/server/auth/session";
import { riderRows } from "@/server/services/rider-list";
import { PageHeader } from "@/components/shared/misc";
import { AddRiderButton } from "@/components/shared/rider-dialog";
import { RidersTable } from "@/components/shared/riders-table";

export const metadata = { title: "Riders" };

export default async function DealerRidersPage() {
  const user = (await getSessionUser())!;
  const rows = await riderRows({ dealerId: user.dealerId! });
  const online = rows.filter((r) => r.online && r.status === "ACTIVE").length;
  return (
    <div>
      <PageHeader
        title="Riders"
        description={`${rows.length} riders · ${online} online. Riders deliver orders for shops using Dukaan Express riders; you approve their wallet withdrawals.`}
        actions={<AddRiderButton endpoint="/dealer/riders" />}
      />
      <RidersTable rows={rows} base="/dealer/riders" />
    </div>
  );
}
