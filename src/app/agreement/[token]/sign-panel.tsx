"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { api, errorMessage } from "@/lib/api-client";

/** Agree → get a code by email → enter it → signed (the shop goes live). */
export function SignPanel({ token, email, ownerName }: { token: string; email: string; ownerName: string }) {
  const [name, setName] = useState(ownerName);
  const [agree, setAgree] = useState(false);
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState<"code" | "sign" | null>(null);
  const [done, setDone] = useState<{ activated: boolean } | null>(null);
  const ready = agree && name.trim().length >= 2;

  async function sendCode() {
    setBusy("code");
    try {
      const r = await api<{ email: string; devCode?: string }>(`/agreements/${token}/code`, { method: "POST" });
      setSentTo(r.email);
      toast.success(r.devCode ? `Code sent (test mode: ${r.devCode})` : `Code sent to ${r.email}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function sign(e: React.FormEvent) {
    e.preventDefault();
    setBusy("sign");
    try {
      const r = await api<{ activated: boolean }>(`/agreements/${token}/accept`, { body: { name, code, agree } });
      setDone(r);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  if (done) {
    return (
      <Card className="items-center gap-3 border-emerald-200 p-8 text-center dark:border-emerald-900">
        <CheckCircle2 className="size-12 text-emerald-600" />
        <h2 className="text-xl font-bold">Agreement signed</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          {done.activated ? "Your shop is now live." : "Thanks! Your shop will go live as soon as it's approved."} We&apos;ve emailed you a signed copy. Sign in
          to the Dukaan Partner app to add products and your bank account.
        </p>
        <Button asChild size="lg" className="mt-2">
          <Link href="/login/staff?next=/shop">Open shop panel</Link>
        </Button>
      </Card>
    );
  }

  return (
    <Card className="gap-4 p-5 sm:p-7">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-5 text-primary" />
        <h2 className="text-lg font-bold">Sign this agreement</h2>
      </div>
      <form onSubmit={sign} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Your full name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} maxLength={80} />
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm">
          <Checkbox checked={agree} onCheckedChange={(v) => setAgree(v === true)} className="mt-0.5" />
          <span>
            I have read and agree to this Seller Agreement and the{" "}
            <Link href="/legal/seller-terms" target="_blank" className="font-medium text-primary underline">
              Seller Terms
            </Link>
            , on behalf of my shop.
          </span>
        </label>
        <div className="space-y-2 rounded-xl bg-muted/60 p-3">
          <p className="flex items-start gap-2 text-sm">
            <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            {sentTo ? (
              <span>
                Enter the 6-digit code sent to <b className="break-all">{sentTo}</b>
              </span>
            ) : (
              <span>
                We&apos;ll email a 6-digit code to <b className="break-all">{email}</b> to confirm it&apos;s you.
              </span>
            )}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {sentTo && (
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6-digit code"
                aria-label="6-digit code"
                className="text-center text-lg tracking-[0.4em] sm:max-w-48"
                autoFocus
              />
            )}
            <Button type="button" variant={sentTo ? "outline" : "default"} onClick={sendCode} disabled={busy !== null || !ready}>
              {busy === "code" && <Loader2 className="size-4 animate-spin" />}
              {sentTo ? "Send a new code" : "Email me a code"}
            </Button>
          </div>
          {!agree && !sentTo && <p className="text-xs text-muted-foreground">Tick the box above first.</p>}
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={busy !== null || !ready || code.length !== 6}>
          {busy === "sign" && <Loader2 className="size-4 animate-spin" />}
          Confirm &amp; sign
        </Button>
        <p className="text-center text-xs text-muted-foreground">Signing records your name, the time and your IP address.</p>
      </form>
    </Card>
  );
}
