"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  Boxes,
  ClipboardList,
  FileSpreadsheet,
  FolderTree,
  IndianRupee,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Megaphone,
  Menu,
  ScrollText,
  Settings,
  Store,
  Truck,
  UserCog,
  Users,
  Zap,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/shared/notification-bell";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/orders", label: "Orders", icon: ClipboardList, badge: "orders" },
  { href: "/admin/shops", label: "Shops", icon: Store, badge: "shops" },
  { href: "/admin/owners", label: "Shop owners", icon: UserCog },
  { href: "/admin/products", label: "Products", icon: Boxes },
  { href: "/admin/categories", label: "Categories", icon: FolderTree },
  { href: "/admin/customers", label: "Customers", icon: Users },
  { href: "/admin/shipments", label: "Deliveries", icon: Truck, badge: "shipments" },
  { href: "/admin/finance", label: "Commission & payouts", icon: IndianRupee },
  { href: "/admin/reports", label: "Reports", icon: FileSpreadsheet },
  { href: "/admin/marketing", label: "Coupons & banners", icon: Megaphone },
  { href: "/admin/support", label: "Support", icon: LifeBuoy, badge: "support" },
  { href: "/admin/settings", label: "Settings", icon: Settings },
  { href: "/admin/audit", label: "Audit & webhooks", icon: ScrollText },
] as const;

export function AdminChrome({
  userName,
  badges,
  sandbox,
  children,
}: {
  userName: string;
  badges: Record<string, number>;
  sandbox: string[];
  children: React.ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    router.replace("/login/staff");
    router.refresh();
  }

  const nav = (
    <nav className="flex h-full flex-col gap-1 p-3">
      <Link href="/admin" className="mb-4 flex items-center gap-2 px-2 py-1 text-lg font-extrabold text-sidebar-foreground">
        <span className="grid size-8 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <Zap className="size-4" />
        </span>
        Dukaan Admin
      </Link>
      {NAV.map((n) => {
        const active = n.href === "/admin" ? path === "/admin" : path.startsWith(n.href);
        const count = "badge" in n ? badges[n.badge] : 0;
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
              active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )}
          >
            <n.icon className="size-4" />
            <span className="flex-1">{n.label}</span>
            {count > 0 && <span className="rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-amber-950">{count}</span>}
          </Link>
        );
      })}
      <div className="mt-auto space-y-2 border-t border-sidebar-border pt-3">
        <Link href="/api-docs" target="_blank" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/75 hover:text-sidebar-foreground">
          <BarChart3 className="size-4" /> API docs
        </Link>
        <button onClick={logout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/75 hover:text-sidebar-foreground">
          <LogOut className="size-4" /> Log out ({userName})
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-dvh bg-muted/30">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 overflow-y-auto bg-sidebar lg:block">{nav}</aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 border-0 bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          {nav}
        </SheetContent>
      </Sheet>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur lg:px-8">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu />
          </Button>
          {sandbox.length > 0 && (
            <p className="truncate rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800">
              <b>Sandbox adapters active:</b> {sandbox.join(", ")} — add credentials in <code>.env</code> to go live
            </p>
          )}
          <div className="ml-auto">
            <NotificationBell />
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
