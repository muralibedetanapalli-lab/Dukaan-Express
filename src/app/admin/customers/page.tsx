import Link from "next/link";
import { db } from "@/server/db";
import { customerWhere } from "@/server/services/admin";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/misc";
import { Pill } from "@/components/shared/status-badge";
import { Pagination } from "@/components/shared/pagination";
import { FilterBar } from "@/components/admin/filter-bar";
import { formatINR } from "@/lib/money";
import { fmtDate, fmtAgo } from "@/lib/format";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = 25;
  const where = customerWhere(sp.q);
  const [customers, total] = await Promise.all([
    db.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { user: true, _count: { select: { orders: true, tickets: true } } },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.customer.count({ where }),
  ]);
  const spend = await db.order.groupBy({
    by: ["customerId"],
    where: { customerId: { in: customers.map((c) => c.id) }, status: "DELIVERED" },
    _sum: { total: true },
  });
  const spendBy = new Map(spend.map((s) => [s.customerId, s._sum.total ?? 0]));

  return (
    <div>
      <PageHeader title="Customers" description={`${total} registered customers`} />
      <FilterBar basePath="/admin/customers" filters={[{ key: "q", label: "Name, phone or email", type: "search" }]} />
      <Card className="gap-0 overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Last login</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead className="text-right">Lifetime spend</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link href={`/admin/customers/${c.id}`} className="font-semibold text-primary hover:underline">
                    {c.user.name ?? "(no name)"}
                  </Link>
                  <p className="text-xs text-muted-foreground">{c.user.email}</p>
                </TableCell>
                <TableCell>{c.user.phone}</TableCell>
                <TableCell className="text-xs">{fmtDate(c.createdAt)}</TableCell>
                <TableCell className="text-xs">{c.user.lastLoginAt ? fmtAgo(c.user.lastLoginAt) : "—"}</TableCell>
                <TableCell className="text-right">{c._count.orders}</TableCell>
                <TableCell className="text-right">{formatINR(spendBy.get(c.id) ?? 0)}</TableCell>
                <TableCell>
                  <Pill tone={c.user.status === "ACTIVE" ? "success" : "danger"}>{c.user.status.toLowerCase()}</Pill>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <Pagination page={page} pageSize={pageSize} total={total} basePath="/admin/customers" params={{ q: sp.q }} />
    </div>
  );
}
