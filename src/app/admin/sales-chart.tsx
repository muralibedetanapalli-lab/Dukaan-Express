"use client";

import Link from "next/link";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";

interface Point {
  period: string;
  sales: number;
  orders: number;
  commission: number;
}

export function SalesChart({ data, granularity }: { data: Point[]; granularity: string }) {
  const rows = data.map((d) => ({ ...d, label: granularity === "monthly" ? d.period : d.period.slice(5), salesR: d.sales / 100, commissionR: d.commission / 100 }));
  const total = data.reduce((s, d) => s + d.sales, 0);
  const orders = data.reduce((s, d) => s + d.orders, 0);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-semibold">Sales analytics</p>
          <p className="text-sm text-muted-foreground">
            {formatINR(total)} across {orders} orders ({granularity === "daily" ? "last 30 days" : granularity === "weekly" ? "last 12 weeks" : "last 12 months"})
          </p>
        </div>
        <div className="flex rounded-lg bg-muted p-1 text-sm">
          {["daily", "weekly", "monthly"].map((g) => (
            <Link key={g} href={`/admin?g=${g}`} scroll={false} className={cn("rounded-md px-3 py-1 font-medium capitalize", g === granularity ? "bg-background shadow" : "text-muted-foreground")}>
              {g}
            </Link>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={{ left: 0, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="sales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={16} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
              <Tooltip formatter={(v, name) => [`₹${Number(v).toLocaleString("en-IN")}`, name === "salesR" ? "Sales" : "Commission"]} labelClassName="font-semibold" />
              <Area type="monotone" dataKey="salesR" stroke="var(--chart-1)" strokeWidth={2} fill="url(#sales)" />
              <Area type="monotone" dataKey="commissionR" stroke="var(--chart-2)" strokeWidth={2} fill="transparent" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={16} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={28} />
              <Tooltip formatter={(v) => [v, "Orders"]} />
              <Bar dataKey="orders" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
