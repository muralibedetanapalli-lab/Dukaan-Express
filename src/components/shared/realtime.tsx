"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

/**
 * Subscribes to /api/v1/realtime (SSE). Shows a toast for each notification and refreshes the current
 * server-rendered page on order updates so lists and timelines stay live.
 */
export function RealtimeListener({ onNotification, refreshOnUpdate = true, sound = false }: { onNotification?: () => void; refreshOnUpdate?: boolean; sound?: boolean }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/v1/realtime");
    const refresh = () => {
      if (!refreshOnUpdate) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 400);
    };
    es.addEventListener("notification", (e) => {
      try {
        const n = JSON.parse((e as MessageEvent).data) as { title: string; body: string; type: string; data?: { link?: string } };
        toast(n.title, {
          description: n.body,
          action: n.data?.link ? { label: "View", onClick: () => router.push(n.data!.link!) } : undefined,
        });
        if (sound && n.type === "ORDER_NEW") chime();
        onNotification?.();
      } catch {}
      refresh();
    });
    es.addEventListener("order.updated", refresh);
    return () => es.close();
  }, [router, onNotification, refreshOnUpdate, sound]);

  return null;
}

function chime() {
  try {
    const ctx = new AudioContext();
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.3);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.3);
    });
  } catch {}
}
