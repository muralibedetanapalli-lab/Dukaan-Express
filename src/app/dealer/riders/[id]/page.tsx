import { getSessionUser } from "@/server/auth/session";
import { RiderDetail } from "@/components/shared/rider-detail";

export const metadata = { title: "Rider" };

export default async function DealerRiderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await getSessionUser())!;
  return <RiderDetail riderId={id} viewer={user} back={{ href: "/dealer/riders", label: "Riders" }} />;
}
