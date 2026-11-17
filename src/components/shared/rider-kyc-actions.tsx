"use client";

import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { ConfirmButton } from "@/components/shared/confirm-button";
import { api } from "@/lib/api-client";

export function KycReviewActions({ riderId, name }: { riderId: string; name: string }) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap gap-2">
      <ConfirmButton
        title={`Approve ${name}?`}
        description="They can go online and start delivering right away."
        confirmLabel="Approve rider"
        successMessage="Rider approved"
        onConfirm={async () => {
          await api(`/riders/${riderId}/kyc`, { body: { approve: true } });
          router.refresh();
        }}
        size="sm"
      >
        <Check /> Approve
      </ConfirmButton>
      <ConfirmButton
        title={`Reject ${name}'s documents?`}
        description="They see your reason and can upload new photos."
        confirmLabel="Reject"
        destructive
        requireReason
        reasonLabel="What should they fix? (shown to the rider)"
        successMessage="Sent back to the rider"
        onConfirm={async (reason) => {
          await api(`/riders/${riderId}/kyc`, { body: { approve: false, reason } });
          router.refresh();
        }}
        variant="outline"
        size="sm"
      >
        <X /> Reject
      </ConfirmButton>
    </div>
  );
}
