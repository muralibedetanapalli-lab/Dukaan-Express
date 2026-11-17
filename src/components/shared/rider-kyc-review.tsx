import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { Card } from "@/components/ui/card";
import { fmtDateTime } from "@/lib/format";
import { KycReviewActions } from "./rider-kyc-actions";

const DOCS = [
  { key: "aadhaarFront", label: "Aadhaar front" },
  { key: "aadhaarBack", label: "Aadhaar back" },
  { key: "license", label: "Driving licence" },
  { key: "rc", label: "RC" },
] as const;

/** Riders waiting for document approval (dealer: their riders; admin: everyone). */
export async function PendingRiderReviews({ where }: { where: Prisma.RiderWhereInput }) {
  const riders = await db.rider.findMany({
    where: { ...where, kycStatus: "PENDING", user: { deletedAt: null } },
    orderBy: { kycSubmittedAt: "asc" },
    include: { user: { select: { name: true, phone: true, email: true } }, serviceArea: { select: { city: true } }, dealer: { select: { user: { select: { name: true } } } } },
  });
  if (!riders.length) return null;
  return (
    <section className="mb-6 space-y-3">
      <h2 className="font-semibold">
        Riders waiting for approval <span className="text-muted-foreground">({riders.length})</span>
      </h2>
      {riders.map((r) => (
        <Card key={r.id} className="gap-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{r.user.name}</p>
              <p className="text-xs text-muted-foreground">
                {r.user.phone} · {r.user.email}
              </p>
              <p className="text-xs text-muted-foreground">
                {r.serviceArea?.city ?? "No area"}
                {r.dealer ? ` · dealer ${r.dealer.user.name}` : " · no dealer (admin approves)"} · submitted {r.kycSubmittedAt ? fmtDateTime(r.kycSubmittedAt) : "—"}
              </p>
            </div>
            <KycReviewActions riderId={r.id} name={r.user.name ?? "this rider"} />
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl bg-muted/60 p-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Aadhaar</dt>
              <dd className="font-mono">•••• •••• {r.aadhaarLast4}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Driving licence</dt>
              <dd className="font-mono">{r.licenseNumber}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Vehicle</dt>
              <dd>{r.vehicleType}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Vehicle number</dt>
              <dd className="font-mono">{r.vehicleNumber}</dd>
            </div>
          </dl>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {DOCS.map((d) => (
              <a key={d.key} href={`/api/v1/riders/${r.id}/documents/${d.key}`} target="_blank" rel="noreferrer" className="group relative block aspect-[4/3] overflow-hidden rounded-lg border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/v1/riders/${r.id}/documents/${d.key}`} alt={d.label} className="size-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
                <span className="absolute inset-x-0 bottom-0 bg-background/90 px-2 py-0.5 text-center text-xs font-medium">{d.label}</span>
              </a>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Check the photos are clear, the name matches on Aadhaar and licence, and the vehicle number matches the RC.</p>
        </Card>
      ))}
    </section>
  );
}
