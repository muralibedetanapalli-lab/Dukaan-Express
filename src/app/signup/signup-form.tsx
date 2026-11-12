"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BadgeCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DevCodeNotice, PasswordHint, PasswordInput, passwordOk, safeNext } from "@/components/shared/auth-fields";
import { api, errorMessage } from "@/lib/api-client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[6-9]\d{9}$/;

/**
 * Customer signup: name, mobile (required, not verified), email (verified with a 6-digit code), password.
 * "Create account" stays disabled until the email is verified and every field is valid.
 */
export function SignupForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null); // set once the email is verified
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<"send" | "verify" | "create" | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const verified = !!token;
  const emailValid = EMAIL_RE.test(email.trim());
  const phoneValid = PHONE_RE.test(phone);
  const mismatch = confirm.length > 0 && confirm !== password;
  const canCreate = verified && name.trim().length >= 2 && phoneValid && passwordOk(password) && password === confirm && !busy;

  async function sendCode() {
    setBusy("send");
    try {
      const r = await api<{ devCode?: string }>("/auth/signup/send-code", { body: { email: email.trim() } });
      setCodeSent(true);
      setDevCode(r.devCode ?? null);
      setCode("");
      setCooldown(30);
      toast.success(`Code sent to ${email.trim()}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function verifyCode() {
    setBusy("verify");
    try {
      const r = await api<{ verificationToken: string }>("/auth/signup/verify-code", { body: { email: email.trim(), code } });
      setToken(r.verificationToken);
      setDevCode(null);
      toast.success("Email verified");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  function changeEmail() {
    setToken(null);
    setCodeSent(false);
    setCode("");
    setDevCode(null);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!canCreate || !token) return;
    setBusy("create");
    try {
      await api("/auth/signup", { body: { name: name.trim(), phone, email: email.trim(), password, verificationToken: token } });
      toast.success("Welcome to Dukaan Express!");
      router.replace(next);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
      if (err instanceof Error && /verif/i.test(err.message)) changeEmail();
      setBusy(null);
    }
  }

  return (
    <form onSubmit={create} className="mt-6 grid gap-4" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="name">Full name</Label>
        <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="h-11" autoFocus />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="phone">Mobile number</Label>
        <div className="flex">
          <span className="inline-flex h-11 items-center rounded-l-md border border-r-0 bg-muted px-3 text-sm text-muted-foreground">+91</span>
          <Input
            id="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
            className="h-11 rounded-l-none"
            aria-invalid={phone.length === 10 && !phoneValid}
          />
        </div>
        {phone.length === 10 && !phoneValid && <p className="text-xs text-destructive">Enter a valid 10-digit Indian mobile number</p>}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <div className="flex gap-2">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            readOnly={verified || codeSent}
            className="h-11"
            aria-describedby="email-status"
          />
          {!verified && !codeSent && (
            <Button type="button" variant="outline" className="h-11 shrink-0" disabled={!emailValid || busy === "send"} onClick={sendCode}>
              {busy === "send" && <Loader2 className="animate-spin" />} Send code
            </Button>
          )}
        </div>
        <div id="email-status">
          {verified ? (
            <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
              <BadgeCheck className="size-4" /> Email verified
              <button type="button" onClick={changeEmail} className="ml-1 text-xs font-normal text-muted-foreground underline">
                Change
              </button>
            </p>
          ) : codeSent ? (
            <div className="grid gap-2 rounded-lg border p-3">
              <p className="text-sm text-muted-foreground">
                Enter the 6-digit code we emailed to <b className="text-foreground">{email.trim()}</b>.{" "}
                <button type="button" onClick={changeEmail} className="text-xs underline">
                  Change email
                </button>
              </p>
              <DevCodeNotice code={devCode} />
              <div className="flex gap-2">
                <Input
                  aria-label="Verification code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="h-11 font-mono tracking-[0.4em]"
                  placeholder="••••••"
                />
                <Button type="button" className="h-11 shrink-0" disabled={code.length !== 6 || busy === "verify"} onClick={verifyCode}>
                  {busy === "verify" && <Loader2 className="animate-spin" />} Verify
                </Button>
              </div>
              <button type="button" disabled={cooldown > 0 || busy === "send"} onClick={sendCode} className="justify-self-start text-xs font-medium text-primary disabled:text-muted-foreground">
                {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
              </button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">We&apos;ll send a code to verify it. You&apos;ll use this email to log in and reset your password.</p>
          )}
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="password">Create password</Label>
        <PasswordInput id="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={100} />
        <PasswordHint value={password} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirm">Confirm password</Label>
        <PasswordInput id="confirm" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} maxLength={100} aria-invalid={mismatch} />
        {mismatch && <p className="text-xs text-destructive">Passwords don&apos;t match</p>}
      </div>

      <Button type="submit" size="lg" disabled={!canCreate}>
        {busy === "create" && <Loader2 className="animate-spin" />} Create account
      </Button>
      {!verified && <p className="-mt-2 text-center text-xs text-muted-foreground">Verify your email to create your account.</p>}

      <p className="text-center text-xs text-muted-foreground">
        By creating an account you agree to our{" "}
        <Link href="/legal/terms" className="font-medium text-primary hover:underline">
          Terms of Use
        </Link>{" "}
        and{" "}
        <Link href="/legal/privacy" className="font-medium text-primary hover:underline">
          Privacy Policy
        </Link>
        .
      </p>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href={next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`} className="font-semibold text-primary hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
