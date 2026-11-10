import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Server-friendly pagination that preserves the current query string. */
export function Pagination({ page, pageSize, total, basePath, params }: { page: number; pageSize: number; total: number; basePath: string; params: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return <p className="mt-4 text-sm text-muted-foreground">{total} result{total === 1 ? "" : "s"}</p>;
  const href = (p: number) => {
    const sp = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
    sp.set("page", String(p));
    return `${basePath}?${sp.toString()}`;
  };
  return (
    <div className="mt-4 flex items-center justify-between gap-2 text-sm">
      <p className="text-muted-foreground">
        Page {page} of {pages} · {total} results
      </p>
      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm" disabled={page <= 1} className={page <= 1 ? "pointer-events-none opacity-50" : ""}>
          <Link href={href(page - 1)}>
            <ChevronLeft /> Prev
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm" className={page >= pages ? "pointer-events-none opacity-50" : ""}>
          <Link href={href(page + 1)}>
            Next <ChevronRight />
          </Link>
        </Button>
      </div>
    </div>
  );
}
