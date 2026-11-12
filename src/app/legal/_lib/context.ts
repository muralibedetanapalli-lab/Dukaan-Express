import "server-only";
import { cache } from "react";
import { getSettings } from "@/server/services/settings";
import { STATUS_META, type OrderStatusKey } from "@/lib/order-status";
import { bpsToPercent, formatINR } from "@/lib/money";

export const POLICIES = [
  { slug: "terms", title: "Terms of Use", short: "Terms" },
  { slug: "privacy", title: "Privacy Policy", short: "Privacy" },
  { slug: "refunds", title: "Cancellation & Refund Policy", short: "Cancellations & refunds" },
  { slug: "shipping", title: "Shipping & Delivery Policy", short: "Shipping & delivery" },
  { slug: "seller-terms", title: "Seller Terms", short: "Seller terms" },
  { slug: "delete-account", title: "Delete your account", short: "Delete account" },
  { slug: "contact", title: "Contact Us", short: "Contact" },
] as const;

/** Everything the policy pages quote, read from admin settings so the text always matches how the platform behaves. */
export const legalContext = cache(async () => {
  const s = await getSettings();
  const brand = s.platform.name || "Dukaan Express";
  const entity = s.legal.businessName.trim() || brand;
  const updated = /^\d{4}-\d{2}-\d{2}$/.test(s.legal.policiesUpdatedOn)
    ? new Date(`${s.legal.policiesUpdatedOn}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })
    : s.legal.policiesUpdatedOn;
  const cancellable = s.cancellation.customerCancellableStatuses
    .map((k) => STATUS_META[k as OrderStatusKey]?.label.toLowerCase())
    .filter(Boolean) as string[];
  return {
    brand,
    entity,
    address: s.legal.registeredAddress.trim(),
    gstin: s.legal.gstin.trim(),
    supportEmail: s.platform.supportEmail,
    supportPhone: s.platform.supportPhone,
    grievance: {
      name: s.legal.grievanceOfficerName.trim() || "Grievance Officer",
      email: s.legal.grievanceOfficerEmail.trim() || s.platform.supportEmail,
      phone: s.legal.grievanceOfficerPhone.trim() || s.platform.supportPhone,
    },
    jurisdiction: s.legal.jurisdictionCity.trim() || "Bengaluru",
    updated,
    minOrder: formatINR(s.order.minOrderAmount),
    shopAcceptMinutes: s.order.shopAcceptTimeoutMinutes,
    paymentTimeoutMinutes: s.order.paymentTimeoutMinutes,
    cancellable,
    cancellationFee: s.cancellation.cancellationFeePaise > 0 ? formatINR(s.cancellation.cancellationFeePaise) : null,
    autoRefundOnCancel: s.refund.autoRefundOnCancel,
    autoRefundOnReject: s.refund.autoRefundOnReject,
    baseFee: formatINR(s.delivery.baseFee),
    perKmFee: formatINR(s.delivery.perKmFee),
    freeDeliveryAbove: s.delivery.freeDeliveryThreshold > 0 ? formatINR(s.delivery.freeDeliveryThreshold) : null,
    maxRadiusKm: s.delivery.maxRadiusKm,
    defaultCommission: bpsToPercent(s.commission.defaultBps),
    codEnabled: s.payments.codEnabled,
    codMax: formatINR(s.payments.codMaxAmount),
  };
});

export type LegalContext = Awaited<ReturnType<typeof legalContext>>;
