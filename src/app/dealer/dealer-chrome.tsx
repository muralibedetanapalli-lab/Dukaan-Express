"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BadgeCheck, Handshake, IndianRupee, LayoutDashboard, LogOut, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { NotificationBell } from "@/components/shared/notification-bell";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dealer", label: "Home", icon: LayoutDashboard },
  { href: "/dealer/shops", label: "Shops", icon: Store },
  { href: "/dealer/payouts", label: "Payout approvals", short: "Approvals", icon: BadgeCheck },
  { href: "/dealer/earnings", label: "My earnings", short: "Earnings", icon: IndianRupee },
];

export function DealerChrome({ name, regions, pending, children }: { name: string; regions: string[]; pending: number; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    router.replace("/login/staff");
    router.refresh();
  }

  const isActive = (href: string) => (href === "/dealer" ? path === "/dealer" : path.startsWith(href));
  const badge = (href: string) =>
    href === "/dealer/payouts" && pending > 0 ? <span className="grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-bold text-white">{pending}</span> : null;

  return (
    <div className="min-h-dvh bg-muted/30">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex min-w-0 items-center gap-2 text-left">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
                <Handshake className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm leading-tight font-bold">{name}</span>
                <span className="block truncate text-xs text-muted-foreground">Dealer · {regions.length ? regions.join(", ") : "No region yet"}</span>
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Regions</DropdownMenuLabel>
              <p className="px-2 pb-1.5 text-xs text-muted-foreground">{regions.length ? regions.join(", ") : "Ask the admin to assign a region"}</p>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout}>
                <LogOut /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <nav className="ml-6 hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <Button key={n.href} asChild variant="ghost" size="sm" className={cn(isActive(n.href) && "bg-secondary text-primary")}>
                <Link href={n.href}>
                  <n.icon /> {n.label} {badge(n.href)}
                </Link>
              </Button>
            ))}
          </nav>
          <div className="ml-auto">
            <NotificationBell />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pt-4 pb-24 md:pb-10">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
        <ul className="grid grid-cols-4">
          {NAV.map((n) => (
            <li key={n.href}>
              <Link href={n.href} className={cn("relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold", isActive(n.href) ? "text-primary" : "text-muted-foreground")}>
                <n.icon className="size-5" />
                {n.short ?? n.label}
                <span className="absolute top-1 left-1/2 ml-2">{badge(n.href)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
