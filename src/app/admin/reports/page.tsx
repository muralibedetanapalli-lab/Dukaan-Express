import { db } from "@/server/db";
import { PageHeader } from "@/components/shared/misc";
import { ReportsClient } from "./reports-client";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const shops = await db.shop.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return (
    <div>
      <PageHeader title="Reports" description="Preview and download as Excel, CSV or PDF" />
      <ReportsClient shops={shops} />
    </div>
  );
}
