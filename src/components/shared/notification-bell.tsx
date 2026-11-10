"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api-client";
import { fmtAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RealtimeListener } from "./realtime";

interface N {
  id: string;
  title: string;
  body: string;
  type: string;
  readAt: string | null;
  createdAt: string;
  data: { link?: string } | null;
}

export function NotificationBell({ className, sound }: { className?: string; sound?: boolean }) {
  const [items, setItems] = useState<N[]>([]);
  const [unread, setUnread] = useState(0);
  const load = useCallback(async () => {
    try {
      const r = await api<{ items: N[]; unread: number }>("/notifications");
      setItems(r.items);
      setUnread(r.unread);
    } catch {}
  }, []);
  useEffect(() => {
    let cancelled = false;
    api<{ items: N[]; unread: number }>("/notifications")
      .then((r) => {
        if (cancelled) return;
        setItems(r.items);
        setUnread(r.unread);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function markAll() {
    await api("/notifications", { body: { all: true } });
    void load();
  }

  return (
    <>
      <RealtimeListener onNotification={load} sound={sound} />
      <Popover onOpenChange={(o) => o && load()}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className={cn("relative", className)} aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}>
            <Bell className="size-5" />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 grid min-w-4.5 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[min(92vw,380px)] p-0">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="font-semibold">Notifications</p>
            {unread > 0 && (
              <Button variant="ghost" size="sm" onClick={markAll}>
                <CheckCheck /> Mark all read
              </Button>
            )}
          </div>
          <ScrollArea className="max-h-[420px]">
            {items.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
            ) : (
              <ul className="divide-y">
                {items.map((n) => {
                  const body = (
                    <div className={cn("px-4 py-3 text-sm hover:bg-muted/60", !n.readAt && "bg-secondary/40")}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium">{n.title}</p>
                        {!n.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
                      </div>
                      <p className="mt-0.5 text-muted-foreground">{n.body}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{fmtAgo(n.createdAt)}</p>
                    </div>
                  );
                  return <li key={n.id}>{n.data?.link ? <Link href={n.data.link}>{body}</Link> : body}</li>;
                })}
              </ul>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </>
  );
}
