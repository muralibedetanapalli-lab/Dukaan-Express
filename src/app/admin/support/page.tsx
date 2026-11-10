import Link from "next/link";
import { db } from "@/server/db";
import { Card } from "@/components/ui/card";
import { PageHeader, EmptyState } from "@/components/shared/misc";
import { Pill } from "@/components/shared/status-badge";
import { fmtDateTime } from "@/lib/format";
import { formatINR } from "@/lib/money";
import { LifeBuoy } from "lucide-react";
import { TicketActions } from "./ticket-actions";

export const metadata = { title: "Support" };

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const status = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].includes(sp.status ?? "") ? (sp.status as "OPEN") : undefined;
  const tickets = await db.supportTicket.findMany({
    where: status ? { status } : { status: { in: ["OPEN", "IN_PROGRESS"] } },
    orderBy: { createdAt: "desc" },
    include: { customer: { include: { user: true } }, order: { select: { id: true, orderNumber: true, total: true, paymentStatus: true } } },
    take: 200,
  });
  return (
    <div>
      <PageHeader title="Support tickets" description="Customer complaints, refunds and delivery issues" />
      <div className="mb-4 flex gap-2 text-sm">
        {[undefined, "OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((s) => (
          <Link key={s ?? "active"} href={s ? `/admin/support?status=${s}` : "/admin/support"} className={`rounded-full border px-3 py-1 ${status === s ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>
            {s ? s.replace("_", " ").toLowerCase() : "active"}
          </Link>
        ))}
      </div>
      {tickets.length === 0 ? (
        <EmptyState icon={LifeBuoy} title="No tickets" />
      ) : (
        <div className="grid gap-3">
          {tickets.map((t) => (
            <Card key={t.id} className="gap-2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{t.subject}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.ticketNumber} · {t.category.toLowerCase()} · {fmtDateTime(t.createdAt)} ·{" "}
                    <Link href={`/admin/customers/${t.customerId}`} className="text-primary">
                      {t.customer.user.name} ({t.customer.user.phone})
                    </Link>
                    {t.order && (
                      <>
                        {" "}
                        ·{" "}
                        <Link href={`/admin/orders/${t.order.id}`} className="text-primary">
                          {t.order.orderNumber}
                        </Link>{" "}
                        ({formatINR(t.order.total)}, {t.order.paymentStatus.toLowerCase()})
                      </>
                    )}
                  </p>
                </div>
                <Pill tone={t.status === "OPEN" ? "warning" : t.status === "IN_PROGRESS" ? "info" : "success"}>{t.status.replace("_", " ").toLowerCase()}</Pill>
              </div>
              <p className="text-sm whitespace-pre-wrap">{t.message}</p>
              {t.resolution && <p className="rounded-lg bg-muted p-2 text-sm">Resolution: {t.resolution}</p>}
              <TicketActions id={t.id} status={t.status} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
