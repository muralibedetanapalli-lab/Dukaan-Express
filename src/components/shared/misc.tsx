import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card/50 px-6 py-14 text-center", className)}>
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-secondary text-primary">
        <Icon className="size-7" />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-1 inline-block text-sm text-muted-foreground hover:text-foreground">
            ← {back.label}
          </Link>
        )}
        <h1 className="truncate text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  tone?: "default" | "primary" | "warning" | "danger" | "success";
  href?: string;
}) {
  const toneCls = {
    default: "bg-muted text-foreground",
    primary: "bg-secondary text-primary",
    warning: "bg-amber-100 text-amber-700",
    danger: "bg-red-100 text-red-600",
    success: "bg-emerald-100 text-emerald-700",
  }[tone];
  const inner = (
    <Card className="gap-0 p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums">{value}</p>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {Icon && (
          <div className={cn("grid size-10 shrink-0 place-items-center rounded-xl", toneCls)}>
            <Icon className="size-5" />
          </div>
        )}
      </div>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export function KeyValue({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 py-1.5 text-sm", className)}>
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

export function ProductThumb({ src, alt, className }: { src: string | null | undefined; alt: string; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-xl bg-muted", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="size-full object-cover" loading="lazy" />
      ) : (
        <div className="grid size-full place-items-center text-xs text-muted-foreground">No image</div>
      )}
    </div>
  );
}

export function SandboxBadge({ label = "Sandbox" }: { label?: string }) {
  return (
    <span className="inline-flex items-center rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-amber-700 uppercase">
      {label}
    </span>
  );
}
