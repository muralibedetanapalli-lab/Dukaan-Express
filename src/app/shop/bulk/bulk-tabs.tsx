"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, ShoppingBasket, Tags } from "lucide-react";
import { cn } from "@/lib/utils";

export function BulkTabs({ incoming, active, sells }: { incoming: number; active: number; sells: boolean }) {
  const path = usePathname();
  const tabs = [
    {
      href: "/shop/bulk",
      label: "Buy in bulk",
      short: "Buy",
      icon: ShoppingBasket,
      on: path === "/shop/bulk" || path.startsWith("/shop/bulk/sellers"),
      badge: 0,
    },
    { href: "/shop/bulk/orders", label: "Orders", short: "Orders", icon: ClipboardList, on: path.startsWith("/shop/bulk/orders"), badge: incoming + active },
    { href: "/shop/bulk/sell", label: sells ? "Selling in bulk" : "Sell in bulk", short: "Sell", icon: Tags, on: path === "/shop/bulk/sell", badge: 0 },
  ];
  return (
    <nav className="grid grid-cols-3 gap-1 rounded-xl border bg-card p-1">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            "relative flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition sm:text-sm",
            t.on ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted",
          )}
        >
          <t.icon className="size-4 shrink-0" />
          <span className="truncate sm:hidden">{t.short}</span>
          <span className="hidden truncate sm:inline">{t.label}</span>
          {t.badge > 0 && (
            <span className={cn("grid min-w-5 place-items-center rounded-full px-1 text-[10px] font-bold", t.on ? "bg-white/25" : "bg-amber-500 text-white")}>
              {t.badge}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
