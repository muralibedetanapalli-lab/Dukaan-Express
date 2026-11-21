"use client";

import { useState } from "react";
import { FileSignature, Loader2, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, errorMessage } from "@/lib/api-client";

/** Shown instead of the shop panel until the owner signs the seller agreement from their email. */
export function AgreementPending({ shopId, shopName, sentTo }: { shopId: string; shopName: string; sentTo: string | null }) {
  const [busy, setBusy] = useState(false);
  const [to, setTo] = useState(sentTo);

  async function resend() {
    setBusy(true);
    try {
      const r = await api<{ sentTo: string; sent: boolean; devLink?: string }>(`/agreements/shop/${shopId}`, { method: "POST" });
      if (!r.sent) throw new Error("We couldn't send the email right now. Please try again in a minute.");
      setTo(r.sentTo);
      toast.success(`Sent to ${r.sentTo}`, r.devLink ? { description: `Test mode link: ${r.devLink}`, duration: 20000 } : undefined);
      if (r.devLink) console.info("[agreement] signing link", r.devLink);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl py-6">
      <Card className="items-center gap-4 p-6 text-center sm:p-8">
        <span className="grid size-16 place-items-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          <FileSignature className="size-8" />
        </span>
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Sign your seller agreement</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            <b className="text-foreground">{shopName}</b> is ready. To activate it, open the agreement we emailed you, read it and confirm with the code sent to
            the same email.
          </p>
        </div>
        {to && (
          <p className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm break-all">
            <Mail className="size-4 shrink-0 text-muted-foreground" /> {to}
          </p>
        )}
        <ol className="w-full space-y-2 text-left text-sm">
          {["Open the email “Sign your seller agreement”", "Tap Review & sign agreement", "Enter the 6-digit code we email you, then Confirm & sign"].map(
            (s, i) => (
              <li key={i} className="flex items-start gap-3 rounded-xl border p-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i + 1}</span>
                {s}
              </li>
            ),
          )}
        </ol>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={resend} disabled={busy} variant="outline">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Email it again
          </Button>
          <Button onClick={() => window.location.reload()}>I&apos;ve signed it</Button>
        </div>
        <p className="text-xs text-muted-foreground">Can&apos;t find it? Check spam, or ask your dealer to resend. A new email replaces the old link.</p>
      </Card>
    </div>
  );
}
