"use client";

import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { ConfirmButton } from "@/components/shared/confirm-button";
import { api } from "@/lib/api-client";

/** Approve (→ platform admin) or decline a shop's payout request. */
export function PayoutReviewActions({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap gap-2">
      <ConfirmButton
        title={`Approve ${label}?`}
        description="It goes to the platform admin, who transfers the money to the shop's bank account. Approve only after checking the orders and bank details."
        confirmLabel="Approve & send to admin"
        successMessage="Approved — sent to the platform admin"
        onConfirm={async () => {
          await api(`/dealer/payouts/${id}/review`, { body: { approve: true } });
          router.refresh();
        }}
        size="sm"
      >
        <Check /> Approve
      </ConfirmButton>
      <ConfirmButton
        title={`Decline ${label}?`}
        description="The orders go back to the shop's available balance and the owner sees your reason."
        confirmLabel="Decline request"
        destructive
        requireReason
        reasonLabel="Reason shown to the shop owner"
        successMessage="Payout request declined"
        onConfirm={async (reason) => {
          await api(`/dealer/payouts/${id}/review`, { body: { approve: false, reason } });
          router.refresh();
        }}
        variant="outline"
        size="sm"
      >
        <X /> Decline
      </ConfirmButton>
    </div>
  );
}
