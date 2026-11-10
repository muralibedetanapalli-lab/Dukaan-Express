"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Boxes, Loader2, Minus, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { EmptyState, ProductThumb } from "@/components/shared/misc";
import { Pill } from "@/components/shared/status-badge";
import { api, errorMessage } from "@/lib/api-client";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";

interface Row {
  id: string;
  name: string;
  variant: string | null;
  category: string;
  imageUrl: string | null;
  sku: string | null;
  mrp: number;
  price: number;
  stock: number;
  low: boolean;
  isAvailable: boolean;
  approval: string;
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "low", label: "Low stock" },
  { key: "out", label: "Out of stock" },
  { key: "unavailable", label: "Unavailable" },
];

export function InventoryList({ items, filter, q }: { items: Row[]; filter: string; q: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(q);
  // Optimistic per-row overrides layered on top of server data (no state copying of props).
  const [overrides, setOverrides] = useState<Record<string, Partial<Row>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const rows = items.map((r) => ({ ...r, ...overrides[r.id] }));

  async function patch(id: string, body: Record<string, unknown>, optimistic: Partial<Row>) {
    const before = overrides[id];
    setOverrides((o) => ({ ...o, [id]: { ...o[id], ...optimistic } }));
    setBusy(id);
    try {
      const u = await api<{ stock: number; isAvailable: boolean; lowStockThreshold: number }>(`/shop/inventory/${id}`, { method: "PATCH", body });
      setOverrides((o) => ({ ...o, [id]: { stock: u.stock, isAvailable: u.isAvailable, low: u.stock <= u.lowStockThreshold } }));
    } catch (e) {
      setOverrides((o) => ({ ...o, [id]: before ?? {} }));
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const go = (patch: Record<string, string>) => {
    const sp = new URLSearchParams({ filter, ...(query ? { q: query } : {}), ...patch });
    router.push(`/shop/inventory?${sp.toString()}`);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            go({ q: query });
          }}
        >
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, SKU or barcode" className="pl-9" />
        </form>
        <div className="scrollbar-none flex gap-2 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => go({ filter: f.key })}
              className={cn("shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium", filter === f.key ? "border-primary bg-primary text-primary-foreground" : "bg-card")}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Boxes} title="No products here" description="Add products to start selling." />
      ) : (
        <Card className="divide-y gap-0 p-0">
          {rows.map((r) => (
            <div key={r.id} className={cn("flex items-center gap-3 p-3", !r.isAvailable && "opacity-60")}>
              <ProductThumb src={r.imageUrl} alt={r.name} className="size-12 shrink-0" />
              <Link href={`/shop/inventory/${r.id}`} className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {r.name}
                  {r.variant ? ` · ${r.variant}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatINR(r.price)} {r.mrp > r.price && <span className="line-through">{formatINR(r.mrp)}</span>} · {r.category}
                  {r.sku ? ` · ${r.sku}` : ""}
                </p>
                <div className="mt-0.5 flex gap-1">
                  {r.stock === 0 ? <Pill tone="danger">Out of stock</Pill> : r.low ? <Pill tone="warning">Low stock</Pill> : null}
                  {r.approval !== "APPROVED" && <Pill tone="warning">Approval {r.approval.toLowerCase()}</Pill>}
                </div>
              </Link>
              <div className="flex items-center rounded-lg border">
                <button className="grid size-8 place-items-center disabled:opacity-40" disabled={busy === r.id || r.stock === 0} onClick={() => patch(r.id, { stockDelta: -1 }, { stock: r.stock - 1 })} aria-label="Decrease stock">
                  <Minus className="size-3.5" />
                </button>
                <input
                  className="w-12 bg-transparent text-center text-sm font-semibold tabular-nums outline-none"
                  defaultValue={r.stock}
                  key={r.stock}
                  inputMode="numeric"
                  aria-label={`Stock for ${r.name}`}
                  onBlur={(e) => {
                    const v = Math.max(0, Number(e.target.value.replace(/\D/g, "")) || 0);
                    if (v !== r.stock) void patch(r.id, { stock: v }, { stock: v });
                  }}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                />
                <button className="grid size-8 place-items-center" disabled={busy === r.id} onClick={() => patch(r.id, { stockDelta: 1 }, { stock: r.stock + 1 })} aria-label="Increase stock">
                  {busy === r.id ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                </button>
              </div>
              <Switch
                checked={r.isAvailable}
                onCheckedChange={(v) => patch(r.id, { isAvailable: v }, { isAvailable: v })}
                aria-label={`${r.name} available`}
                disabled={busy === r.id}
              />
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
