import { describe, expect, it } from "vitest";
import { computeQuote, couponDiscountFor, deliveryFeeFor, estimateEtaMinutes, type PricingConfig } from "@/server/services/pricing";

const cfg = (over: Partial<PricingConfig> = {}): PricingConfig => ({
  delivery: { baseFee: 2500, perKmFee: 500, freeDeliveryThreshold: 49900 },
  tax: { enabled: true, pricesInclusive: true, deliveryFeeTaxBps: 1800 },
  order: { minOrderAmount: 9900 },
  coupons: { maxDiscountPercentOfOrder: 50 },
  commissionBps: 1000,
  ...over,
});

describe("pricing engine", () => {
  it("sums MRP, selling price and product discount in paise", () => {
    const q = computeQuote(
      [
        { mrp: 5000, price: 4500, quantity: 2, taxRateBps: 500 },
        { mrp: 2000, price: 2000, quantity: 1, taxRateBps: 0 },
      ],
      cfg(),
      { distanceKm: 1 },
    );
    expect(q.itemsMrpTotal).toBe(12000);
    expect(q.subtotal).toBe(11000);
    expect(q.itemDiscount).toBe(1000);
    expect(q.deliveryFee).toBe(2500);
    // Inclusive pricing: tax is informational, not added to the total
    expect(q.total).toBe(11000 + 2500);
    expect(q.taxInclusive).toBe(true);
  });

  it("charges per extra km beyond 2 km and waives the fee above the threshold", () => {
    expect(deliveryFeeFor(1.2, cfg().delivery)).toBe(2500);
    expect(deliveryFeeFor(4.1, cfg().delivery)).toBe(2500 + 3 * 500);
    const q = computeQuote([{ mrp: 60000, price: 50000, quantity: 1, taxRateBps: 500 }], cfg(), { distanceKm: 6 });
    expect(q.deliveryFee).toBe(0);
  });

  it("adds tax on top when prices are tax-exclusive", () => {
    const q = computeQuote([{ mrp: 10000, price: 10000, quantity: 1, taxRateBps: 1800 }], cfg({ tax: { enabled: true, pricesInclusive: false, deliveryFeeTaxBps: 0 } }), { distanceKm: 1 });
    expect(q.taxAmount).toBe(1800);
    expect(q.total).toBe(10000 + 2500 + 1800);
  });

  it("extracts included GST correctly", () => {
    const q = computeQuote([{ mrp: 10500, price: 10500, quantity: 1, taxRateBps: 500 }], cfg({ tax: { enabled: true, pricesInclusive: true, deliveryFeeTaxBps: 0 } }), { distanceKm: 1 });
    expect(q.lineTaxes[0]).toBe(500); // 10500 = 10000 + 5%
  });

  it("caps coupons by max discount and % of order", () => {
    expect(couponDiscountFor(100000, { code: "P", type: "PERCENT", value: 2000, maxDiscount: 8000, minOrderAmount: 0 }, 50)).toBe(8000);
    expect(couponDiscountFor(10000, { code: "F", type: "FLAT", value: 9000, maxDiscount: null, minOrderAmount: 0 }, 50)).toBe(5000);
  });

  it("refuses coupons below the minimum order value with a helpful message", () => {
    const q = computeQuote([{ mrp: 10000, price: 10000, quantity: 1, taxRateBps: 0 }], cfg(), {
      distanceKm: 1,
      coupon: { code: "SAVE10", type: "PERCENT", value: 1000, maxDiscount: null, minOrderAmount: 29900 },
    });
    expect(q.couponDiscount).toBe(0);
    expect(q.couponError).toMatch(/SAVE10/);
  });

  it("computes commission on items after coupon and the shop's earning", () => {
    const q = computeQuote([{ mrp: 30000, price: 30000, quantity: 1, taxRateBps: 0 }], cfg({ commissionBps: 1200 }), {
      distanceKm: 1,
      coupon: { code: "F50", type: "FLAT", value: 5000, maxDiscount: null, minOrderAmount: 0 },
    });
    expect(q.couponDiscount).toBe(5000);
    expect(q.commissionAmount).toBe(3000); // 12% of 25000
    expect(q.shopEarning).toBe(22000);
  });

  it("flags orders below the platform minimum", () => {
    const q = computeQuote([{ mrp: 5000, price: 5000, quantity: 1, taxRateBps: 0 }], cfg(), { distanceKm: 1 });
    expect(q.meetsMinimum).toBe(false);
  });

  it("estimates ETA from prep time, distance and speed with a 10 minute floor", () => {
    expect(estimateEtaMinutes(5, 10, 20, 5)).toBe(30);
    expect(estimateEtaMinutes(0.1, 1, 30, 0)).toBe(10);
  });
});
