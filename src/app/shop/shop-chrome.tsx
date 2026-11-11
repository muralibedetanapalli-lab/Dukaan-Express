"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Boxes, ClipboardList, IndianRupee, LayoutDashboard, LogOut, Settings, Store } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { NotificationBell } from "@/components/shared/notification-bell";
import { api, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/shop", label: "Home", icon: LayoutDashboard },
  { href: "/shop/orders", label: "Orders", icon: ClipboardList },
  { href: "/shop/inventory", label: "Inventory", icon: Boxes },
  { href: "/shop/earnings", label: "Earnings & payouts", icon: IndianRupee },
  { href: "/shop/settings", label: "Settings", icon: Settings },
];

export function ShopChrome({
  shop,
  shops,
  ownerName,
  children,
}: {
  shop: { id: string; name: string; acceptingOrders: boolean; isActive: boolean; approvalStatus: string };
  shops: { id: string; name: string }[];
  ownerName: string;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const [accepting, setAccepting] = useState(shop.acceptingOrders);

  async function toggle(v: boolean) {
    setAccepting(v);
    try {
      await api("/shop/me", { method: "PATCH", body: { acceptingOrders: v } });
      toast.success(v ? "You're now accepting orders" : "Order intake paused");
    } catch (e) {
      setAccepting(!v);
      toast.error(errorMessage(e));
    }
  }

  async function switchShop(id: string) {
    await api("/shop/me", { method: "PATCH", body: { switchToShopId: id } });
    router.refresh();
  }

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    router.replace("/login/staff");
    router.refresh();
  }

  const isActive = (href: string) => (href === "/shop" ? path === "/shop" : path.startsWith(href));

  return (
    <div className="min-h-dvh bg-muted/30">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex min-w-0 items-center gap-2 text-left">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
                <Store className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm leading-tight font-bold">{shop.name}</span>
                <span className="block text-xs text-muted-foreground">{ownerName}</span>
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {shops.length > 1 && (
                <>
                  <DropdownMenuLabel>Switch shop</DropdownMenuLabel>
                  {shops.map((s) => (
                    <DropdownMenuItem key={s.id} onClick={() => switchShop(s.id)} className={cn(s.id === shop.id && "font-semibold text-primary")}>
                      {s.name}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={logout}>
                <LogOut /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <nav className="ml-6 hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <Button key={n.href} asChild variant="ghost" size="sm" className={cn(isActive(n.href) && "bg-secondary text-primary")}>
                <Link href={n.href}>
                  <n.icon /> {n.label}
                </Link>
              </Button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs font-semibold">
              <span className={cn("hidden sm:inline", accepting ? "text-primary" : "text-muted-foreground")}>{accepting ? "Accepting orders" : "Paused"}</span>
              <Switch checked={accepting} onCheckedChange={toggle} aria-label="Accepting orders" />
            </label>
            <NotificationBell sound />
          </div>
        </div>
        {(!shop.isActive || shop.approvalStatus !== "APPROVED") && (
          <div className="bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-900">
            {shop.approvalStatus !== "APPROVED" ? `Shop is ${shop.approvalStatus.toLowerCase()} — awaiting admin approval.` : "Shop is inactive — customers can't see it until the admin activates it."}
          </div>
        )}
      </header>
      <main className="mx-auto max-w-5xl px-4 pt-4 pb-24 md:pb-10">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
        <ul className="grid grid-cols-5">
          {NAV.map((n) => (
            <li key={n.href}>
              <Link href={n.href} className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold", isActive(n.href) ? "text-primary" : "text-muted-foreground")}>
                <n.icon className="size-5" />
                {n.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
