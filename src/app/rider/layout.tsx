import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { RiderChrome } from "./rider-chrome";

export const dynamic = "force-dynamic";

export default async function RiderLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user || user.role !== "RIDER" || !user.riderId) redirect("/login/staff?next=/rider");
  const rider = await db.rider.findUniqueOrThrow({
    where: { id: user.riderId },
    include: { deliveries: { where: { status: { in: ["COURIER_ASSIGNED", "OUT_FOR_DELIVERY"] } }, select: { id: true } } },
  });
  const vehicle = [rider.vehicleType, rider.vehicleNumber].filter(Boolean).join(" · ") || null;
  return (
    <RiderChrome name={user.name ?? "Rider"} vehicle={vehicle} online={rider.isOnline} busy={rider.deliveries.length > 0}>
      {children}
    </RiderChrome>
  );
}
