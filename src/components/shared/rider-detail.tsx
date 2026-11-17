import Link from "next/link";
import { notFound } from "next/navigation";
import { Bike, CheckCircle2, Clock, IndianRupee, MapPin, Phone, Mail, Star, XCircle } from "lucide-react";
import { db } from "@/server/db";
import type { SessionUser } from "@/server/auth/session";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KeyValue, PageHeader, StatCard } from "@/components/shared/misc";
import { Pill, ShipmentStatusBadge } from "@/components/shared/status-badge";
import { formatINR } from "@/lib/money";
import { fmtAgo, fmtDate, fmtDateTime } from "@/lib/format";
import { payoutStatus } from "@/lib/payout";
import { KycReviewActions } from "./rider-kyc-actions";

const DOCS = [
  { key: "aadhaarFront", field: "aadhaarFrontRef", label: "Aadhaar front" },
  { key: "aadhaarBack", field: "aadhaarBackRef", label: "Aadhaar back" },
  { key: "license", field: "licenseRef", label: "Driving licence" },
  { key: "rc", field: "rcRef", label: "RC" },
] as const;

const KYC_LABEL: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  APPROVED: { label: "Verified", tone: "success" },
  PENDING: { label: "Awaiting approval", tone: "warning" },
  REJECTED: { label: "Documents rejected", tone: "danger" },
  NOT_SUBMITTED: { label: "Documents not uploaded", tone: "neutral" },
};

const ENTRY_LABEL: Record<string, string> = {
  DELIVERY_EARNING: "Delivery earning",
  COD_COLLECTED: "Cash collected (COD)",
  WITHDRAWAL: "Withdrawal",
  WITHDRAWAL_REVERSAL: "Withdrawal returned",
  ADJUSTMENT: "Adjustment",
};

/** Everything about one rider, for the admin (any rider) and dealers (their own riders). */
export async function RiderDetail({ riderId, viewer, back }: { riderId: string; viewer: SessionUser; back: { href: string; label: string } }) {
  const rider = await db.rider.findUnique({
    where: { id: riderId },
    include: {
      user: { select: { name: true, email: true, phone: true, status: true, lastLoginAt: true, createdAt: true } },
      dealer: { select: { id: true, user: { select: { name: true } } } },
      serviceArea: { select: { city: true, state: true } },
      bankAccount: { select: { accountHolderName: true, accountLast4: true, ifsc: true, bankName: true } },
    },
  });
  if (!rider) notFound();
  if (viewer.role === "DEALER" && rider.dealerId !== viewer.dealerId) notFound();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [delivered, thisMonth, failed, gaveBack, wallet, earned, cash, deliveries, entries, withdrawals, badges, reviewer] = await Promise.all([
    db.shipment.count({ where: { riderId, status: "DELIVERED" } }),
    db.shipment.count({ where: { riderId, status: "DELIVERED", deliveredAt: { gte: monthStart } } }),
    db.shipment.count({ where: { riderId, failedDeliveryCount: { gt: 0 } } }),
    db.shipmentTrackingEvent.count({ where: { shipment: { riderId }, status: "CREATED", description: { contains: "gave it back" } } }),
    db.riderWalletEntry.aggregate({ where: { riderId }, _sum: { amount: true } }),
    db.riderWalletEntry.aggregate({ where: { riderId, type: "DELIVERY_EARNING" }, _sum: { amount: true } }),
    db.riderWalletEntry.aggregate({ where: { riderId, type: "COD_COLLECTED" }, _sum: { amount: true } }),
    db.shipment.findMany({
      where: { riderId },
      orderBy: { updatedAt: "desc" },
      take: 20,
      include: { order: { select: { id: true, orderNumber: true, placedAt: true, etaMinutes: true, shop: { select: { name: true } } } } },
    }),
    db.riderWalletEntry.findMany({ where: { riderId }, orderBy: { createdAt: "desc" }, take: 15 }),
    db.riderWithdrawal.findMany({ where: { riderId }, orderBy: { createdAt: "desc" }, take: 10 }),
    db.badge.findMany({ where: { riderId }, orderBy: { period: "desc" }, take: 12 }),
    rider.kycReviewedById ? db.user.findUnique({ where: { id: rider.kycReviewedById }, select: { name: true, role: true } }) : null,
  ]);
  const doneDeliveries = deliveries.filter((d) => d.status === "DELIVERED" && d.deliveredAt);
  const onTime = doneDeliveries.filter((d) => d.deliveredAt!.getTime() - d.order.placedAt.getTime() <= (d.order.etaMinutes + 10) * 60_000).length;
  const kyc = KYC_LABEL[rider.kycStatus];
  const docsUploaded = DOCS.filter((d) => rider[d.field]);
  const canReview = rider.kycStatus === "PENDING" && (viewer.role === "SUPER_ADMIN" || (viewer.role === "DEALER" && rider.dealerId === viewer.dealerId));
  const balance = wallet._sum.amount ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        back={back}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {rider.user.name}
            {badges[0] && (
              <Pill tone="warning">
                <Star className="size-3.5 fill-current" /> Top rider · {badges[0].categoryName}
              </Pill>
            )}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Pill tone={kyc.tone}>{kyc.label}</Pill>
            {rider.user.status !== "ACTIVE" ? <Pill>Deactivated</Pill> : rider.isOnline ? <Pill tone="success">Online</Pill> : <Pill>Offline</Pill>}
            <span>joined {fmtDate(rider.user.createdAt)}</span>
          </span>
        }
        actions={canReview ? <KycReviewActions riderId={rider.id} name={rider.user.name ?? "this rider"} /> : undefined}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Delivered" value={delivered} hint={`${thisMonth} this month`} icon={CheckCircle2} tone="success" />
        <StatCard label="On time (recent)" value={doneDeliveries.length ? `${Math.round((onTime / doneDeliveries.length) * 100)}%` : "—"} hint={`last ${doneDeliveries.length} deliveries`} icon={Clock} />
        <StatCard label="Failed / given back" value={`${failed} / ${gaveBack}`} icon={XCircle} tone={failed ? "danger" : "default"} />
        <StatCard label="Wallet" value={formatINR(balance)} hint={balance < 0 ? "owes collected cash" : "available"} icon={IndianRupee} tone={balance < 0 ? "danger" : "primary"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="gap-2 p-5">
          <p className="font-semibold">Profile</p>
          <KeyValue label="Mobile">
            <a href={`tel:${rider.user.phone}`} className="inline-flex items-center gap-1 text-primary">
              <Phone className="size-3.5" /> {rider.user.phone}
            </a>
          </KeyValue>
          <KeyValue label="Email">
            <span className="inline-flex items-center gap-1">
              <Mail className="size-3.5" /> {rider.user.email}
            </span>
          </KeyValue>
          <KeyValue label="Area">
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" /> {rider.serviceArea ? `${rider.serviceArea.city}, ${rider.serviceArea.state}` : "—"}
            </span>
          </KeyValue>
          <KeyValue label="Dealer">{rider.dealer?.user.name ?? "None (admin manages)"}</KeyValue>
          <KeyValue label="Vehicle">
            <span className="inline-flex items-center gap-1">
              <Bike className="size-3.5" /> {[rider.vehicleType, rider.vehicleNumber].filter(Boolean).join(" · ") || "—"}
            </span>
          </KeyValue>
          <KeyValue label="Last login">{rider.user.lastLoginAt ? fmtAgo(rider.user.lastLoginAt) : "Never"}</KeyValue>
          <KeyValue label="Last GPS">
            {rider.locationAt && rider.lat != null ? (
              <a href={`https://www.openstreetmap.org/?mlat=${rider.lat}&mlon=${rider.lng}#map=16/${rider.lat}/${rider.lng}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                {fmtAgo(rider.locationAt)} · view on map
              </a>
            ) : (
              "—"
            )}
          </KeyValue>
          <KeyValue label="Earned / cash collected">
            {formatINR(earned._sum.amount ?? 0)} / {formatINR(-(cash._sum.amount ?? 0))}
          </KeyValue>
          <KeyValue label="Bank account">
            {rider.bankAccount ? `${rider.bankAccount.accountHolderName} · ${rider.bankAccount.bankName ?? ""} •••• ${rider.bankAccount.accountLast4} (${rider.bankAccount.ifsc})` : "Not added"}
          </KeyValue>
        </Card>

        <Card className="gap-3 p-5">
          <div className="flex items-center justify-between">
            <p className="font-semibold">Verification</p>
            <Pill tone={kyc.tone}>{kyc.label}</Pill>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <KeyValue label="Aadhaar">{rider.aadhaarLast4 ? `•••• •••• ${rider.aadhaarLast4}` : "—"}</KeyValue>
            <KeyValue label="Licence">{rider.licenseNumber ?? "—"}</KeyValue>
          </div>
          {rider.kycSubmittedAt && <p className="text-xs text-muted-foreground">Submitted {fmtDateTime(rider.kycSubmittedAt)}</p>}
          {rider.kycReviewedAt && (
            <p className="text-xs text-muted-foreground">
              {rider.kycStatus === "REJECTED" ? "Rejected" : "Reviewed"} {fmtDateTime(rider.kycReviewedAt)}
              {reviewer ? ` by ${reviewer.name} (${reviewer.role === "DEALER" ? "dealer" : "admin"})` : rider.kycSubmittedAt ? "" : " — added by dealer/admin"}
            </p>
          )}
          {rider.kycNote && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">Reason: {rider.kycNote}</p>}
          {docsUploaded.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {docsUploaded.map((d) => (
                <a key={d.key} href={`/api/v1/riders/${rider.id}/documents/${d.key}`} target="_blank" rel="noreferrer" className="group relative block aspect-[4/3] overflow-hidden rounded-lg border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/v1/riders/${rider.id}/documents/${d.key}`} alt={d.label} className="size-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
                  <span className="absolute inset-x-0 bottom-0 bg-background/90 px-2 py-0.5 text-center text-xs font-medium">{d.label}</span>
                </a>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No documents uploaded{rider.kycStatus === "APPROVED" ? " — added and verified by a dealer or admin." : "."}</p>
          )}
        </Card>
      </div>

      {badges.length > 0 && (
        <Card className="gap-2 p-5">
          <p className="font-semibold">Star badges</p>
          <div className="flex flex-wrap gap-2">
            {badges.map((b) => (
              <Pill key={b.id} tone="warning">
                <Star className="size-3.5 fill-current" /> {b.categoryName} · {b.period}
              </Pill>
            ))}
          </div>
        </Card>
      )}

      <Card className="gap-0 overflow-hidden p-0">
        <p className="border-b px-4 py-3 font-semibold">Recent deliveries</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Shop</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Fee</TableHead>
              <TableHead className="text-right">Cash</TableHead>
              <TableHead>Delivered</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deliveries.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No deliveries yet
                </TableCell>
              </TableRow>
            )}
            {deliveries.map((d) => (
              <TableRow key={d.id}>
                <TableCell>
                  {viewer.role === "SUPER_ADMIN" ? (
                    <Link href={`/admin/orders/${d.order.id}`} className="font-medium text-primary hover:underline">
                      {d.order.orderNumber}
                    </Link>
                  ) : (
                    <span className="font-medium">{d.order.orderNumber}</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">{d.order.shop.name}</TableCell>
                <TableCell>
                  <ShipmentStatusBadge status={d.status} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatINR(d.riderFee)}</TableCell>
                <TableCell className="text-right tabular-nums">{d.codAmount ? formatINR(d.codAmount) : "—"}</TableCell>
                <TableCell className="text-xs">{d.deliveredAt ? fmtDateTime(d.deliveredAt) : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="gap-0 overflow-hidden p-0">
          <p className="border-b px-4 py-3 font-semibold">Wallet history</p>
          {entries.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No activity</p>
          ) : (
            <ul className="divide-y">
              {entries.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium">{ENTRY_LABEL[e.type] ?? e.type}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {e.note ? `${e.note} · ` : ""}
                      {fmtDateTime(e.createdAt)}
                    </span>
                  </span>
                  <span className={`shrink-0 font-semibold tabular-nums ${e.amount < 0 ? "text-red-600" : "text-emerald-700"}`}>
                    {e.amount < 0 ? "−" : "+"} {formatINR(Math.abs(e.amount))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="gap-0 overflow-hidden p-0">
          <p className="border-b px-4 py-3 font-semibold">Withdrawals</p>
          {withdrawals.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No withdrawals</p>
          ) : (
            <ul className="divide-y">
              {withdrawals.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                  <span>
                    <span className="font-semibold tabular-nums">{formatINR(w.amount)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {fmtDate(w.createdAt)}
                      {w.reference ? ` · UTR ${w.reference}` : ""}
                      {w.rejectionReason ? ` · ${w.rejectionReason}` : ""}
                    </span>
                  </span>
                  <Pill tone={payoutStatus(w.status).tone}>{w.status === "DEALER_REVIEW" ? "With dealer" : payoutStatus(w.status).label}</Pill>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
