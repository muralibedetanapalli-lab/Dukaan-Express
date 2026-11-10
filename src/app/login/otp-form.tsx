"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorMessage } from "@/lib/api-client";

export function OtpLoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") || "/";
  const [step, setStep] = useState<"phone" | "otp" | "profile">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendOtp(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ devOtp?: string }>("/auth/otp/request", { body: { phone } });
      setDevOtp(r.devOtp ?? null);
      setStep("otp");
      setCooldown(30);
      toast.success("OTP sent");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ needsProfile: boolean }>("/auth/otp/verify", { body: { phone, otp } });
      if (r.needsProfile) setStep("profile");
      else {
        router.replace(next);
        router.refresh();
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/auth/me", { method: "PATCH", body: { name, email } });
      router.replace(next);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (step === "profile") {
    return (
      <form onSubmit={saveProfile} className="mt-6 grid gap-4">
        <p className="rounded-xl bg-secondary p-3 text-sm text-secondary-foreground">Welcome! Tell us a little about yourself.</p>
        <div className="grid gap-2">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">Email (optional)</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <Button type="submit" size="lg" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} Continue
        </Button>
      </form>
    );
  }

  if (step === "otp") {
    return (
      <form onSubmit={verify} className="mt-6 grid gap-4">
        <p className="text-sm">
          Enter the 6-digit code sent to <b>+91 {phone}</b>{" "}
          <button type="button" className="text-primary hover:underline" onClick={() => setStep("phone")}>
            Change
          </button>
        </p>
        {devOtp && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800">
            <b>Sandbox SMS:</b> no SMS provider is configured, so your OTP is <b className="font-mono text-sm">{devOtp}</b>
          </p>
        )}
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
          placeholder="••••••"
          className="h-12 text-center font-mono text-2xl tracking-[0.5em]"
          autoFocus
          aria-label="One-time password"
        />
        <Button type="submit" size="lg" disabled={busy || otp.length !== 6}>
          {busy && <Loader2 className="animate-spin" />} Verify & continue
        </Button>
        <Button type="button" variant="ghost" disabled={cooldown > 0 || busy} onClick={() => sendOtp()}>
          {cooldown > 0 ? `Resend OTP in ${cooldown}s` : "Resend OTP"}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={sendOtp} className="mt-6 grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="phone">Mobile number</Label>
        <div className="flex">
          <span className="inline-flex items-center rounded-l-md border border-r-0 bg-muted px-3 text-sm text-muted-foreground">+91</span>
          <Input
            id="phone"
            inputMode="numeric"
            autoComplete="tel-national"
            maxLength={10}
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
            className="h-11 rounded-l-none text-base"
            placeholder="98765 43210"
            autoFocus
          />
        </div>
      </div>
      <Button type="submit" size="lg" disabled={busy || phone.length !== 10}>
        {busy && <Loader2 className="animate-spin" />} Get OTP
      </Button>
      <p className="text-center text-xs text-muted-foreground">By continuing you agree to our Terms of Service and Privacy Policy.</p>
    </form>
  );
}
