"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSignature, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/shared/status-badge";
import { api, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export type AgreementInfo = {
  number: string;
  status: "PENDING" | "ACCEPTED" | "VOID";
  sentTo: string;
  sentAt: string | Date;
  acceptedAt: string | Date | null;
  acceptedName: string | null;
  acceptedIp?: string | null;
} | null;

const when = (d: string | Date) =>
  new Date(d).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });

/** Seller agreement status for a shop, with resend and download. Used on admin and dealer shop pages. */
export function AgreementCard({ shopId, agreement, hasOwner, className }: { shopId: string; agreement: AgreementInfo; hasOwner: boolean; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const signed = agreement?.status === "ACCEPTED";

  async function resend() {
    setBusy(true);
    try {
      const r = await api<{ sentTo: string; sent: boolean; devLink?: string }>(`/agreements/shop/${shopId}`, { method: "POST" });
      if (!r.sent) toast.error("The agreement was created but the email couldn't be sent. Try again in a minute.");
      else toast.success(`Agreement emailed to ${r.sentTo}`, r.devLink ? { description: `Test mode link: ${r.devLink}`, duration: 20000 } : undefined);
      if (r.devLink) console.info("[agreement] signing link", r.devLink);
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      className={cn(
        "gap-3 p-4 sm:flex-row sm:items-center",
        signed ? "" : "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-xl",
            signed
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
          )}
        >
          <FileSignature className="size-5" />
        </span>
        <div className="min-w-0 text-sm">
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            Seller agreement
            {signed ? <Pill tone="success">Signed</Pill> : agreement ? <Pill tone="warning">Waiting for owner</Pill> : <Pill>Not sent</Pill>}
          </p>
          {signed && agreement ? (
            <p className="text-muted-foreground">
              {agreement.number} · signed by {agreement.acceptedName} on {when(agreement.acceptedAt!)}
              {agreement.acceptedIp ? ` · IP ${agreement.acceptedIp}` : ""}
            </p>
          ) : agreement ? (
            <p className="break-words text-muted-foreground">
              Emailed to {agreement.sentTo} on {when(agreement.sentAt)}. The shop goes live when the owner signs it with the code sent to that email.
            </p>
          ) : (
            <p className="text-muted-foreground">
              {hasOwner ? "No agreement has been sent for this shop yet." : "Assign an owner with an email address to send the agreement."}
            </p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        {agreement && (
          <Button asChild variant="outline" size="sm">
            <a href={`/api/v1/agreements/shop/${shopId}`}>
              <Download className="size-4" /> PDF
            </a>
          </Button>
        )}
        {!signed && hasOwner && (
          <Button size="sm" onClick={resend} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {agreement ? "Resend" : "Send"}
          </Button>
        )}
      </div>
    </Card>
  );
}
