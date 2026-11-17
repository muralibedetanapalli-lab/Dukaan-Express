import { getSessionUser } from "@/server/auth/session";
import { riderRows } from "@/server/services/rider-list";
import { PageHeader } from "@/components/shared/misc";
import { AddRiderButton } from "@/components/shared/rider-dialog";
import { RidersTable } from "@/components/shared/riders-table";
import { PendingRiderReviews } from "@/components/shared/rider-kyc-review";

export const metadata = { title: "Riders" };

export default async function DealerRidersPage() {
  const user = (await getSessionUser())!;
  const rows = await riderRows({ dealerId: user.dealerId! });
  const online = rows.filter((r) => r.online && r.status === "ACTIVE").length;
  return (
    <div>
      <PageHeader
        title="Riders"
        description={`${rows.length} riders · ${online} online. New riders who sign up in your area need your approval (check their documents below). You also approve their wallet withdrawals.`}
        actions={<AddRiderButton endpoint="/dealer/riders" />}
      />
      <PendingRiderReviews where={{ dealerId: user.dealerId! }} />
      <RidersTable rows={rows} base="/dealer/riders" />
    </div>
  );
}
