import "server-only";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import type { RiderRow } from "@/components/shared/riders-table";

/** Rows for the riders tables (dealer portal / admin console). */
export async function riderRows(where: Prisma.RiderWhereInput): Promise<RiderRow[]> {
  const riders = await db.rider.findMany({
    where: { ...where, user: { deletedAt: null } },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { name: true, email: true, phone: true, status: true, lastLoginAt: true } },
      dealer: { select: { user: { select: { name: true } } } },
      deliveries: { where: { status: { in: ["COURIER_ASSIGNED", "OUT_FOR_DELIVERY"] } }, select: { id: true } },
      _count: { select: { deliveries: { where: { status: "DELIVERED" } } } },
    },
  });
  const ids = riders.map((r) => r.id);
  const balances = ids.length ? await db.riderWalletEntry.groupBy({ by: ["riderId"], where: { riderId: { in: ids } }, _sum: { amount: true } }) : [];
  const bal = new Map(balances.map((b) => [b.riderId, b._sum.amount ?? 0]));
  return riders.map((r) => ({
    id: r.id,
    name: r.user.name ?? "Rider",
    email: r.user.email,
    phone: r.user.phone,
    vehicle: [r.vehicleType, r.vehicleNumber].filter(Boolean).join(" · ") || null,
    dealer: r.dealer?.user.name ?? null,
    status: r.user.status,
    online: r.isOnline,
    busy: r.deliveries.length > 0,
    deliveries: r._count.deliveries,
    balance: bal.get(r.id) ?? 0,
    lastLogin: r.user.lastLoginAt,
    locationAt: r.locationAt,
  }));
}
