import { db } from "@/server/db";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/misc";
import { Pill } from "@/components/shared/status-badge";
import { ActionButton } from "@/components/admin/action-button";
import { fmtAgo } from "@/lib/format";
import { CreateOwnerButton } from "./owner-dialog";

export const metadata = { title: "Shop owners" };

export default async function OwnersPage() {
  const [owners, unassignedShops] = await Promise.all([
    db.shopOwner.findMany({
      where: { user: { deletedAt: null } },
      include: { user: true, shops: { where: { deletedAt: null }, select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.shop.findMany({ where: { ownerId: null, deletedAt: null }, select: { id: true, name: true } }),
  ]);
  return (
    <div>
      <PageHeader title="Shop owners" description="Create owner accounts, assign shops and manage credentials" actions={<CreateOwnerButton shops={unassignedShops} />} />
      <Card className="gap-0 overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Owner</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Shops</TableHead>
              <TableHead>Last login</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {owners.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-semibold">{o.user.name}</TableCell>
                <TableCell className="text-xs">
                  {o.user.email}
                  <br />
                  {o.user.phone}
                </TableCell>
                <TableCell className="text-xs">{o.shops.map((s) => s.name).join(", ") || <span className="text-muted-foreground">None</span>}</TableCell>
                <TableCell className="text-xs">{o.user.lastLoginAt ? fmtAgo(o.user.lastLoginAt) : "Never"}</TableCell>
                <TableCell>
                  <Pill tone={o.user.status === "ACTIVE" ? "success" : "neutral"}>{o.user.status.toLowerCase()}</Pill>
                </TableCell>
                <TableCell className="space-x-2 text-right">
                  <ActionButton
                    path={`/admin/owners/${o.user.id}`}
                    body={{ action: "reset_password" }}
                    variant="outline"
                    confirm={{ title: `Reset password for ${o.user.name}?`, description: "A temporary password will be generated and all their sessions signed out.", label: "Reset" }}
                    showResult={{ field: "temporaryPassword", template: "Temporary password: {value} — share it securely with the owner" }}
                  >
                    Reset password
                  </ActionButton>
                  <ActionButton
                    path={`/admin/owners/${o.user.id}`}
                    method="PATCH"
                    body={{ status: o.user.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }}
                    variant={o.user.status === "ACTIVE" ? "ghost" : "default"}
                    success="Updated"
                    confirm={o.user.status === "ACTIVE" ? { title: "Deactivate this owner?", description: "They will be signed out and cannot log in.", label: "Deactivate" } : undefined}
                  >
                    {o.user.status === "ACTIVE" ? "Deactivate" : "Activate"}
                  </ActionButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
