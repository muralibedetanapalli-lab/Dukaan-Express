"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface FilterDef {
  key: string;
  label: string;
  type: "search" | "select" | "date";
  options?: { value: string; label: string }[];
}

/** URL-driven filters for admin list pages (works with server-rendered tables). */
export function FilterBar({ basePath, filters }: { basePath: string; filters: FilterDef[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(filters.map((f) => [f.key, sp.get(f.key) ?? ""])));

  const apply = (next: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v && v !== "__all") p.set(k, v);
    router.push(`${basePath}${p.size ? `?${p.toString()}` : ""}`);
  };
  const has = Object.values(values).some((v) => v && v !== "__all");

  return (
    <form
      className="mb-4 flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        apply(values);
      }}
    >
      {filters.map((f) =>
        f.type === "search" ? (
          <div key={f.key} className="relative min-w-52 flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={values[f.key]} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} placeholder={f.label} className="pl-9" aria-label={f.label} />
          </div>
        ) : f.type === "date" ? (
          <label key={f.key} className="grid gap-1 text-xs text-muted-foreground">
            {f.label}
            <Input type="date" value={values[f.key]} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} className="w-40" />
          </label>
        ) : (
          <Select
            key={f.key}
            value={values[f.key] || "__all"}
            onValueChange={(v) => {
              const next = { ...values, [f.key]: v };
              setValues(next);
              apply(next);
            }}
          >
            <SelectTrigger className="w-44" aria-label={f.label}>
              <SelectValue placeholder={f.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All {f.label.toLowerCase()}</SelectItem>
              {f.options?.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ),
      )}
      <Button type="submit" variant="secondary">
        Apply
      </Button>
      {has && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            const cleared = Object.fromEntries(filters.map((f) => [f.key, ""]));
            setValues(cleared);
            apply({});
          }}
        >
          <X /> Clear
        </Button>
      )}
    </form>
  );
}
