// Pure pricing engine. The backend is the only source of truth for totals.
import { applyBps } from "@/lib/money";

export interface PriceLine {
  mrp: number;
  price: number; // selling price per unit (paise)
  quantity: number;
  taxRateBps: number;
}

export interface CouponRule {
  code: string;
  type: "FLAT" | "PERCENT";
  value: number;
  maxDiscount: number | null;
  minOrderAmount: number;
}

export interface PricingConfig {
  delivery: { baseFee: number; perKmFee: number; freeDeliveryThreshold: number };
  tax: { enabled: boolean; pricesInclusive: boolean; deliveryFeeTaxBps: number };
  order: { minOrderAmount: number };
  coupons: { maxDiscountPercentOfOrder: number };
  commissionBps: number;
}

export interface Quote {
  itemsMrpTotal: number;
  subtotal: number;
  itemDiscount: number;
  couponDiscount: number;
  couponCode: string | null;
  couponError: string | null;
  deliveryFee: number;
  taxAmount: number;
  taxInclusive: boolean;
  total: number;
  minOrderAmount: number;
  meetsMinimum: boolean;
  amountToFreeDelivery: number;
  lineTaxes: number[];
  commissionBps: number;
  commissionAmount: number;
  shopEarning: number;
}

/** Fee grows per km beyond the first 2 km. */
export function deliveryFeeFor(distanceKm: number, cfg: PricingConfig["delivery"]) {
  const extraKm = Math.max(0, Math.ceil(distanceKm) - 2);
  return cfg.baseFee + extraKm * cfg.perKmFee;
}

export function couponDiscountFor(subtotal: number, coupon: CouponRule, maxPercentOfOrder: number) {
  if (subtotal < coupon.minOrderAmount) return 0;
  let d = coupon.type === "FLAT" ? coupon.value : applyBps(subtotal, coupon.value);
  if (coupon.maxDiscount != null) d = Math.min(d, coupon.maxDiscount);
  d = Math.min(d, Math.floor((subtotal * maxPercentOfOrder) / 100));
  return Math.max(0, Math.min(d, subtotal));
}

export function computeQuote(
  lines: PriceLine[],
  cfg: PricingConfig,
  opts: { distanceKm: number; coupon?: CouponRule | null; couponError?: string | null },
): Quote {
  const itemsMrpTotal = lines.reduce((s, l) => s + l.mrp * l.quantity, 0);
  const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);
  const itemDiscount = Math.max(0, itemsMrpTotal - subtotal);

  let couponDiscount = 0;
  let couponError = opts.couponError ?? null;
  if (opts.coupon) {
    if (subtotal < opts.coupon.minOrderAmount) {
      couponError = `Add items worth ₹${((opts.coupon.minOrderAmount - subtotal) / 100).toFixed(0)} more to use ${opts.coupon.code}`;
    } else {
      couponDiscount = couponDiscountFor(subtotal, opts.coupon, cfg.coupons.maxDiscountPercentOfOrder);
    }
  }

  const afterCoupon = subtotal - couponDiscount;
  const deliveryFee =
    lines.length === 0 || afterCoupon >= cfg.delivery.freeDeliveryThreshold
      ? 0
      : deliveryFeeFor(opts.distanceKm, cfg.delivery);

  // Allocate coupon proportionally across lines so tax is computed on the discounted value.
  const lineTaxes = lines.map((l) => {
    if (!cfg.tax.enabled || subtotal === 0) return 0;
    const lineTotal = l.price * l.quantity;
    const share = Math.round((couponDiscount * lineTotal) / subtotal);
    const taxable = lineTotal - share;
    return cfg.tax.pricesInclusive
      ? taxable - Math.round((taxable * 10_000) / (10_000 + l.taxRateBps))
      : applyBps(taxable, l.taxRateBps);
  });
  const itemTax = lineTaxes.reduce((a, b) => a + b, 0);
  const deliveryTax = !cfg.tax.enabled
    ? 0
    : cfg.tax.pricesInclusive
      ? deliveryFee - Math.round((deliveryFee * 10_000) / (10_000 + cfg.tax.deliveryFeeTaxBps))
      : applyBps(deliveryFee, cfg.tax.deliveryFeeTaxBps);
  const taxAmount = itemTax + deliveryTax;

  const total = afterCoupon + deliveryFee + (cfg.tax.pricesInclusive ? 0 : taxAmount);

  const commissionAmount = applyBps(afterCoupon, cfg.commissionBps);
  const shopEarning = afterCoupon + (cfg.tax.pricesInclusive ? 0 : itemTax) - commissionAmount;

  return {
    itemsMrpTotal,
    subtotal,
    itemDiscount,
    couponDiscount,
    couponCode: couponDiscount > 0 ? (opts.coupon?.code ?? null) : null,
    couponError,
    deliveryFee,
    taxAmount,
    taxInclusive: cfg.tax.pricesInclusive,
    total,
    minOrderAmount: cfg.order.minOrderAmount,
    meetsMinimum: subtotal >= cfg.order.minOrderAmount,
    amountToFreeDelivery: Math.max(0, cfg.delivery.freeDeliveryThreshold - afterCoupon),
    lineTaxes,
    commissionBps: cfg.commissionBps,
    commissionAmount,
    shopEarning,
  };
}

/** ETA = shop prep time + travel time + handover buffer. */
export function estimateEtaMinutes(distanceKm: number, prepMinutes: number, speedKmph: number, bufferMinutes: number) {
  return Math.max(10, Math.round(prepMinutes + (distanceKm / speedKmph) * 60 + bufferMinutes));
}
