"use client";

import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface Cat {
  slug: string;
  name: string;
  subs: { slug: string; name: string }[];
}

const SORT_LABELS: Record<string, string> = {
  relevance: "Relevance",
  eta: "Fastest delivery",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
  discount: "Biggest discount",
  newest: "Newest",
};

export function SearchFilters({ categories, current }: { categories: Cat[]; current: { category?: string; sub?: string; sort: string; q?: string } }) {
  const router = useRouter();
  const go = (patch: Record<string, string | undefined>) => {
    const next = { ...current, ...patch };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) sp.set(k, v);
    router.push(`/search?${sp.toString()}`);
  };
  const cat = categories.find((c) => c.slug === current.category);

  return (
    <div className="my-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="scrollbar-none flex flex-1 gap-2 overflow-x-auto">
          <Chip active={!current.category} onClick={() => go({ category: undefined, sub: undefined })}>
            All
          </Chip>
          {categories.map((c) => (
            <Chip key={c.slug} active={current.category === c.slug} onClick={() => go({ category: c.slug, sub: undefined })}>
              {c.name}
            </Chip>
          ))}
        </div>
        <Select value={current.sort} onValueChange={(v) => go({ sort: v })}>
          <SelectTrigger className="w-44 shrink-0" aria-label="Sort by">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {Object.entries(SORT_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {cat && cat.subs.length > 0 && (
        <div className="scrollbar-none flex gap-2 overflow-x-auto">
          {cat.subs.map((s) => (
            <Chip key={s.slug} small active={current.sub === s.slug} onClick={() => go({ sub: current.sub === s.slug ? undefined : s.slug })}>
              {s.name}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ active, small, onClick, children }: { active: boolean; small?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border font-medium whitespace-nowrap transition",
        small ? "px-3 py-1 text-xs" : "px-3.5 py-1.5 text-sm",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary",
      )}
    >
      {children}
    </button>
  );
}
