import { z } from "zod";
import { format, startOfDay, endOfDay, subDays } from "date-fns";
import { api } from "@/server/http";
import { buildReport, REPORT_TYPES, toCsv, toPdf, toXlsx } from "@/server/services/reports";
import { audit } from "@/server/services/audit";

/** Downloadable reports in CSV, Excel or PDF. Returns JSON preview when format=json. */
export const GET = api(
  {
    roles: ["SUPER_ADMIN"],
    query: z.object({
      type: z.enum(REPORT_TYPES),
      format: z.enum(["csv", "xlsx", "pdf", "json"]).default("json"),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      shopId: z.string().optional(),
    }),
    rateLimit: { name: "reports", limit: 30 },
  },
  async ({ user, query }) => {
    const from = startOfDay(query.from ?? subDays(new Date(), 29));
    const to = endOfDay(query.to ?? new Date());
    const table = await buildReport(query.type, from, to, query.shopId);
    if (query.format === "json") return table;
    const subtitle = `${format(from, "dd MMM yyyy")} – ${format(to, "dd MMM yyyy")} · generated ${format(new Date(), "dd MMM yyyy HH:mm")}`;
    const base = `${query.type}_${format(from, "yyyyMMdd")}-${format(to, "yyyyMMdd")}`;
    await audit({ id: user.id, role: user.role }, "report.download", "Report", query.type, { after: { format: query.format } });
    if (query.format === "csv") {
      return new Response(toCsv(table), {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"` },
      });
    }
    if (query.format === "xlsx") {
      return new Response(new Uint8Array(await toXlsx(table, subtitle)), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${base}.xlsx"`,
        },
      });
    }
    return new Response(new Uint8Array(await toPdf(table, subtitle)), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${base}.pdf"` },
    });
  },
);
