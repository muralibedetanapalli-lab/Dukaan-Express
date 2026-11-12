"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DevCodeNotice, PasswordHint, PasswordInput, passwordOk } from "@/components/shared/auth-fields";
import { api, errorMessage } from "@/lib/api-client";

/** Forgot password for any account with an email (customers, shop owners, admins). */
export function ForgotPasswordForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "reset">("email");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ devCode?: string }>("/auth/password/forgot", { body: { email: email.trim() } });
      setDevCode(r.devCode ?? null);
      setStep("reset");
      setCooldown(30);
      toast.success("If that email is registered, a reset code is on its way.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function reset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ redirect: string }>("/auth/password/reset", { body: { email: email.trim(), code, newPassword: password } });
      toast.success("Password updated. You're logged in.");
      router.replace(r.redirect);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  }

  if (step === "email") {
    return (
      <form onSubmit={send} className="mt-6 grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" autoFocus />
        </div>
        <Button type="submit" size="lg" disabled={busy || !email.includes("@")}>
          {busy && <Loader2 className="animate-spin" />} Send reset code
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={reset} className="mt-6 grid gap-4">
      <p className="text-sm text-muted-foreground">
        Enter the 6-digit code sent to <b className="text-foreground">{email.trim()}</b> and choose a new password.
      </p>
      <DevCodeNotice code={devCode} />
      <div className="grid gap-2">
        <Label htmlFor="code">Reset code</Label>
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="h-11 font-mono tracking-[0.4em]"
          autoFocus
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="new-password">New password</Label>
        <PasswordInput id="new-password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={100} />
        <PasswordHint value={password} />
      </div>
      <Button type="submit" size="lg" disabled={busy || code.length !== 6 || !passwordOk(password)}>
        {busy && <Loader2 className="animate-spin" />} Set new password
      </Button>
      <div className="flex justify-between text-xs">
        <button type="button" onClick={() => setStep("email")} className="text-muted-foreground underline">
          Use a different email
        </button>
        <button type="button" disabled={cooldown > 0 || busy} onClick={() => send()} className="font-medium text-primary disabled:text-muted-foreground">
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </button>
      </div>
    </form>
  );
}
