"use client";

import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { ConfirmButton } from "@/components/shared/confirm-button";
import { api } from "@/lib/api-client";

/** Approve (→ platform admin) or decline a shop's payout request. */
export function PayoutReviewActions({
  id,
  label,
  endpoint = `/dealer/payouts/${id}/review`,
  approveHelp = "It goes to the platform admin, who transfers the money to the shop's bank account. Approve only after checking the orders and bank details.",
  declineHelp = "The orders go back to the shop's available balance and the owner sees your reason.",
}: {
  id: string;
  label: string;
  endpoint?: string;
  approveHelp?: string;
  declineHelp?: string;
}) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap gap-2">
      <ConfirmButton
        title={`Approve ${label}?`}
        description={approveHelp}
        confirmLabel="Approve & send to admin"
        successMessage="Approved — sent to the platform admin"
        onConfirm={async () => {
          await api(endpoint, { body: { approve: true } });
          router.refresh();
        }}
        size="sm"
      >
        <Check /> Approve
      </ConfirmButton>
      <ConfirmButton
        title={`Decline ${label}?`}
        description={declineHelp}
        confirmLabel="Decline request"
        destructive
        requireReason
        reasonLabel="Reason (they will see it)"
        successMessage="Payout request declined"
        onConfirm={async (reason) => {
          await api(endpoint, { body: { approve: false, reason } });
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
