import { getSessionUser } from "@/server/auth/session";
import { RiderDetail } from "@/components/shared/rider-detail";

export const metadata = { title: "Rider" };
export const dynamic = "force-dynamic";

export default async function AdminRiderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await getSessionUser())!;
  return <RiderDetail riderId={id} viewer={user} back={{ href: "/admin/riders", label: "Riders" }} />;
}
