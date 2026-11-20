"use client";

import { useState } from "react";
import { Loader2, Power } from "lucide-react";
import { useRiderOnline } from "./rider-chrome";
import { cn } from "@/lib/utils";

/** Big Go online / Go offline button for the home screen (same state as the header switch). */
export function OnlineButton({ className }: { className?: string }) {
  const ctx = useRiderOnline();
  const [busy, setBusy] = useState(false);
  if (!ctx) return null;
  const { online, toggle } = ctx;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await toggle(!online).finally(() => setBusy(false));
      }}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-base font-bold shadow-lg transition active:scale-[0.98] disabled:opacity-70",
        online ? "bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/25" : "bg-amber-400 text-amber-950 hover:bg-amber-300",
        className,
      )}
    >
      {busy ? <Loader2 className="size-5 animate-spin" /> : <Power className="size-5" />}
      {online ? "Go offline" : "Go online"}
    </button>
  );
}
