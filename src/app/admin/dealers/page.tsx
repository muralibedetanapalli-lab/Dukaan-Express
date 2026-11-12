import { db } from "@/server/db";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/misc";
import { Pill } from "@/components/shared/status-badge";
import { ActionButton } from "@/components/admin/action-button";
import { bpsToPercent, formatINR } from "@/lib/money";
import { fmtAgo } from "@/lib/format";
import { DealerDialog, type RegionOption } from "./dealer-dialog";

export const metadata = { title: "Dealers" };

export default async function DealersPage() {
  const [dealers, areas, earned, owed] = await Promise.all([
    db.dealer.findMany({
      where: { user: { deletedAt: null } },
      include: { user: true, regions: { select: { id: true, city: true } }, _count: { select: { shops: { where: { deletedAt: null } } } } },
      orderBy: { createdAt: "desc" },
    }),
    db.serviceArea.findMany({ orderBy: [{ state: "asc" }, { city: "asc" }], include: { dealer: { select: { id: true, user: { select: { name: true } } } } } }),
    db.commission.groupBy({ by: ["dealerId"], where: { dealerId: { not: null } }, _sum: { dealerAmount: true } }),
    db.commission.groupBy({ by: ["dealerId"], where: { dealerId: { not: null }, dealerPayoutId: null }, _sum: { dealerAmount: true } }),
  ]);
  const regions: RegionOption[] = areas.map((a) => ({ id: a.id, label: `${a.city}, ${a.state}`, dealerId: a.dealer?.id ?? null, dealerName: a.dealer?.user.name ?? null }));
  const earnedOf = new Map(earned.map((e) => [e.dealerId, e._sum.dealerAmount ?? 0]));
  const owedOf = new Map(owed.map((e) => [e.dealerId, e._sum.dealerAmount ?? 0]));
  const free = areas.filter((a) => !a.dealerId).map((a) => a.city);

  return (
    <div>
      <PageHeader
        title="Dealers"
        description={`Regional dealers onboard shops, approve their payout requests and earn a share of commission.${free.length ? ` Regions without a dealer: ${free.join(", ")}.` : ""}`}
        actions={<DealerDialog regions={regions} />}
      />
      <Card className="gap-0 overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Dealer</TableHead>
              <TableHead>Regions</TableHead>
              <TableHead className="text-right">Shops</TableHead>
              <TableHead className="text-right">Share</TableHead>
              <TableHead className="text-right">Earned / unpaid</TableHead>
              <TableHead>Last login</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dealers.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  No dealers yet. Create one and assign their regions.
                </TableCell>
              </TableRow>
            )}
            {dealers.map((d) => (
              <TableRow key={d.id}>
                <TableCell>
                  <p className="font-semibold">{d.user.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.user.email} · {d.user.phone}
                  </p>
                </TableCell>
                <TableCell className="text-xs">{d.regions.map((r) => r.city).join(", ") || <span className="text-muted-foreground">None</span>}</TableCell>
                <TableCell className="text-right">{d._count.shops}</TableCell>
                <TableCell className="text-right">{bpsToPercent(d.commissionShareBps)}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {formatINR(earnedOf.get(d.id) ?? 0)}
                  <br />
                  <span className="text-muted-foreground">{formatINR(owedOf.get(d.id) ?? 0)} unpaid</span>
                </TableCell>
                <TableCell className="text-xs">{d.user.lastLoginAt ? fmtAgo(d.user.lastLoginAt) : "Never"}</TableCell>
                <TableCell>
                  <Pill tone={d.user.status === "ACTIVE" ? "success" : "neutral"}>{d.user.status.toLowerCase()}</Pill>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap justify-end gap-2">
                    <DealerDialog
                      regions={regions}
                      initial={{ id: d.id, name: d.user.name ?? "", email: d.user.email ?? "", phone: d.user.phone ?? "", sharePercent: String(d.commissionShareBps / 100), regionIds: d.regions.map((r) => r.id) }}
                    />
                    <ActionButton
                      path={`/admin/dealers/${d.id}/password`}
                      body={{}}
                      variant="outline"
                      size="sm"
                      confirm={{ title: `Reset password for ${d.user.name}?`, description: "A temporary password will be generated and all their sessions signed out.", label: "Reset" }}
                      showResult={{ field: "temporaryPassword", template: "Temporary password: {value} — share it securely with the dealer" }}
                    >
                      Reset password
                    </ActionButton>
                    <ActionButton
                      path={`/admin/dealers/${d.id}`}
                      method="PATCH"
                      body={{ status: d.user.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }}
                      variant={d.user.status === "ACTIVE" ? "ghost" : "default"}
                      size="sm"
                      success="Updated"
                      confirm={
                        d.user.status === "ACTIVE"
                          ? { title: "Deactivate this dealer?", description: "They are signed out and can't log in. Their shops keep running; reassign them from each shop's page.", label: "Deactivate" }
                          : undefined
                      }
                    >
                      {d.user.status === "ACTIVE" ? "Deactivate" : "Activate"}
                    </ActionButton>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
