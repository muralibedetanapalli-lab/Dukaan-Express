import Link from "next/link";
import { Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pill } from "@/components/shared/status-badge";
import { ActionButton } from "@/components/admin/action-button";
import { formatINR } from "@/lib/money";
import { fmtAgo } from "@/lib/format";

export interface RiderRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  vehicle: string | null;
  dealer?: string | null;
  status: string;
  kyc: string;
  star?: string | null;
  area?: string | null;
  online: boolean;
  busy: boolean;
  deliveries: number;
  balance: number;
  lastLogin: Date | null;
  locationAt: Date | null;
}

/** Riders list for the dealer portal (base "/dealer/riders") and the admin console (base "/admin/riders"). */
export function RidersTable({ rows, base, showDealer }: { rows: RiderRow[]; base: "/dealer/riders" | "/admin/riders"; showDealer?: boolean }) {
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Rider</TableHead>
            {showDealer && <TableHead>Dealer</TableHead>}
            <TableHead>Now</TableHead>
            <TableHead className="text-right">Deliveries</TableHead>
            <TableHead className="text-right">Wallet</TableHead>
            <TableHead>Last login</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={showDealer ? 7 : 6} className="py-10 text-center text-muted-foreground">
                No riders yet
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <Link href={`${base}/${r.id}`} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                  {r.name}
                  {r.star && <Star className="size-3.5 fill-amber-400 text-amber-500" aria-label={`Top rider · ${r.star}`} />}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {r.phone} · {r.email}
                </p>
                {(r.vehicle || r.area) && <p className="text-xs text-muted-foreground">{[r.vehicle, r.area].filter(Boolean).join(" · ")}</p>}
              </TableCell>
              {showDealer && <TableCell className="text-sm">{r.dealer ?? <span className="text-muted-foreground">—</span>}</TableCell>}
              <TableCell>
                {r.status !== "ACTIVE" ? (
                  <Pill>Inactive</Pill>
                ) : r.kyc === "PENDING" ? (
                  <Pill tone="warning">Awaiting approval</Pill>
                ) : r.kyc === "NOT_SUBMITTED" ? (
                  <Pill>Documents not uploaded</Pill>
                ) : r.kyc === "REJECTED" ? (
                  <Pill tone="danger">Documents rejected</Pill>
                ) : r.busy ? (
                  <Pill tone="primary">On a delivery</Pill>
                ) : r.online ? (
                  <Pill tone="success">Online</Pill>
                ) : (
                  <Pill>Offline</Pill>
                )}
                {r.locationAt && <p className="mt-0.5 text-xs text-muted-foreground">GPS {fmtAgo(r.locationAt)}</p>}
              </TableCell>
              <TableCell className="text-right">{r.deliveries}</TableCell>
              <TableCell className={`text-right tabular-nums ${r.balance < 0 ? "text-red-600" : ""}`}>{formatINR(r.balance)}</TableCell>
              <TableCell className="text-xs">{r.lastLogin ? fmtAgo(r.lastLogin) : "Never"}</TableCell>
              <TableCell>
                <div className="flex flex-wrap justify-end gap-2">
                  <ActionButton
                    path={`${base}/${r.id}/password`}
                    body={{}}
                    variant="outline"
                    size="sm"
                    confirm={{ title: `Reset password for ${r.name}?`, description: "A temporary password is generated and the rider is signed out.", label: "Reset" }}
                    showResult={{ field: "temporaryPassword", template: "Temporary password: {value} — share it securely with the rider" }}
                  >
                    Reset password
                  </ActionButton>
                  <ActionButton
                    path={`${base}/${r.id}`}
                    method="PATCH"
                    body={{ status: r.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }}
                    variant={r.status === "ACTIVE" ? "ghost" : "default"}
                    size="sm"
                    success="Updated"
                    confirm={r.status === "ACTIVE" ? { title: "Deactivate this rider?", description: "They are signed out and can't take deliveries.", label: "Deactivate" } : undefined}
                  >
                    {r.status === "ACTIVE" ? "Deactivate" : "Activate"}
                  </ActionButton>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
