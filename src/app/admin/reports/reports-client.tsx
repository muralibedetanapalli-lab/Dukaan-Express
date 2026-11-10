"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2, Sheet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const TYPES = [
  { key: "daily-sales", label: "Daily sales" },
  { key: "monthly-sales", label: "Monthly sales" },
  { key: "shop-sales", label: "Shop-wise sales" },
  { key: "product-sales", label: "Product-wise sales" },
  { key: "commission", label: "Commission" },
  { key: "orders", label: "Orders" },
  { key: "delivery", label: "Delivery" },
  { key: "customers", label: "Customers" },
];

interface Table {
  title: string;
  columns: { key: string; label: string; money?: boolean }[];
  rows: Record<string, string | number | null>[];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function ReportsClient({ shops }: { shops: { id: string; name: string }[] }) {
  const [type, setType] = useState("daily-sales");
  const [from, setFrom] = useState(() => iso(new Date(Date.now() - 29 * 86400_000)));
  const [to, setTo] = useState(() => iso(new Date()));
  const [shopId, setShopId] = useState("__all");
  const [result, setResult] = useState<{ key: string; data: Table } | null>(null);

  const qs = useCallback(
    (format: string) => {
      const p = new URLSearchParams({ type, format, from, to });
      if (shopId !== "__all") p.set("shopId", shopId);
      return p.toString();
    },
    [type, from, to, shopId],
  );

  const key = qs("json");
  useEffect(() => {
    let cancelled = false;
    api<Table>(`/admin/reports?${key}`)
      .then((t) => !cancelled && setResult({ key, data: t }))
      .catch((e) => toast.error(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [key]);
  const data = result?.data ?? null;
  const loading = result?.key !== key;

  return (
    <div className="space-y-4">
      <div className="scrollbar-none flex gap-2 overflow-x-auto">
        {TYPES.map((t) => (
          <button
            key={t.key}
            onClick={() => setType(t.key)}
            className={cn("shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium", type === t.key ? "border-primary bg-primary text-primary-foreground" : "bg-card")}
          >
            {t.label}
          </button>
        ))}
      </div>
      <Card className="flex-row flex-wrap items-end gap-3 p-4">
        <div className="grid gap-1">
          <Label className="text-xs">From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Shop</Label>
          <Select value={shopId} onValueChange={setShopId}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All shops</SelectItem>
              {shops.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href={`/api/v1/admin/reports?${qs("xlsx")}`}>
              <FileSpreadsheet /> Excel
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={`/api/v1/admin/reports?${qs("csv")}`}>
              <Sheet /> CSV
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={`/api/v1/admin/reports?${qs("pdf")}`}>
              <FileText /> PDF
            </a>
          </Button>
        </div>
      </Card>
      <Card className="gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="font-semibold">{data?.title ?? "Report"}</p>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />} {data?.rows.length ?? 0} rows (preview shows first 200)
          </p>
        </div>
        {loading && !data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {data?.columns.map((c) => (
                    <TableHead key={c.key} className={c.money ? "text-right" : ""}>
                      {c.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={data.columns.length} className="py-8 text-center text-muted-foreground">
                      No data for this period
                    </TableCell>
                  </TableRow>
                )}
                {data?.rows.slice(0, 200).map((r, i) => (
                  <TableRow key={i}>
                    {data.columns.map((c) => (
                      <TableCell key={c.key} className={c.money ? "text-right tabular-nums" : ""}>
                        {c.money && typeof r[c.key] === "number" ? `₹${((r[c.key] as number) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : String(r[c.key] ?? "")}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
