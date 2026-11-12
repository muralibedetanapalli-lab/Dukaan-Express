"use client";

import { useState } from "react";
import { Eye, EyeOff, FlaskConical } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function PasswordInput({ className, ...props }: Omit<React.ComponentProps<typeof Input>, "type">) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input type={show ? "text" : "password"} className={cn("h-11 pr-10", className)} {...props} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

/** Same rule as the server's passwordPolicy. */
export const passwordOk = (p: string) => p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);

export function PasswordHint({ value }: { value: string }) {
  const rules = [
    { ok: value.length >= 8, label: "8+ characters" },
    { ok: /[A-Za-z]/.test(value), label: "a letter" },
    { ok: /\d/.test(value), label: "a number" },
  ];
  return (
    <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
      {rules.map((r) => (
        <span key={r.label} className={r.ok ? "text-emerald-600 dark:text-emerald-400" : undefined}>
          {r.ok ? "✓" : "•"} {r.label}
        </span>
      ))}
    </p>
  );
}

/** Shown only when no email provider is configured and the server chose to reveal the code. */
export function DevCodeNotice({ code }: { code: string | null }) {
  if (!code) return null;
  return (
    <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <FlaskConical className="size-4 shrink-0" />
      <span>
        Email sandbox: your code is <b className="font-mono text-sm tracking-widest">{code}</b>
      </span>
    </p>
  );
}

/** Only allow same-site relative redirects. */
export const safeNext = (next: string | null, fallback = "/") => (next && next.startsWith("/") && !next.startsWith("//") ? next : fallback);
