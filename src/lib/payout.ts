import type { Tone } from "@/components/shared/status-badge";

/** Display metadata for payout (ShopSettlement) statuses — shared by shop and admin screens. */
export const PAYOUT_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Requested", tone: "warning" },
  PROCESSING: { label: "Processing", tone: "info" },
  PAID: { label: "Paid", tone: "success" },
  REJECTED: { label: "Declined", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export const payoutStatus = (s: string) => PAYOUT_STATUS[s] ?? { label: s.toLowerCase(), tone: "neutral" as Tone };

export interface BankSnapshot {
  accountHolderName: string;
  accountLast4: string;
  ifsc: string;
  bankName?: string | null;
  upiId?: string | null;
}
