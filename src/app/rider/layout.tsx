import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { RiderChrome } from "./rider-chrome";
import { RiderOnboarding } from "./onboarding";

export const dynamic = "force-dynamic";

export default async function RiderLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user || user.role !== "RIDER" || !user.riderId) redirect("/login/staff?next=/rider");
  const rider = await db.rider.findUniqueOrThrow({
    where: { id: user.riderId },
    include: {
      serviceArea: { select: { city: true, state: true } },
      deliveries: { where: { status: { in: ["COURIER_ASSIGNED", "OUT_FOR_DELIVERY"] } }, select: { id: true } },
    },
  });
  const vehicle = [rider.vehicleType, rider.vehicleNumber].filter(Boolean).join(" · ") || null;
  const approved = rider.kycStatus === "APPROVED";
  return (
    <RiderChrome name={user.name ?? "Rider"} vehicle={vehicle} online={rider.isOnline} busy={rider.deliveries.length > 0} approved={approved}>
      {approved ? (
        children
      ) : (
        // Not verified yet: every rider page shows the documents screen instead.
        <RiderOnboarding
          s={{
            riderId: rider.id,
            status: rider.kycStatus as "NOT_SUBMITTED" | "PENDING" | "REJECTED",
            note: rider.kycNote,
            area: rider.serviceArea ? `${rider.serviceArea.city}, ${rider.serviceArea.state}` : null,
            uploaded: { aadhaarFront: !!rider.aadhaarFrontRef, aadhaarBack: !!rider.aadhaarBackRef, license: !!rider.licenseRef, rc: !!rider.rcRef },
            aadhaarLast4: rider.aadhaarLast4,
            licenseNumber: rider.licenseNumber,
            vehicleType: rider.vehicleType,
            vehicleNumber: rider.vehicleNumber,
          }}
        />
      )}
    </RiderChrome>
  );
}
