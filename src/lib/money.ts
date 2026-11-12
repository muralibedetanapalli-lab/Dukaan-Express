/** All money is integer paise. These helpers are the only place rupees ↔ paise conversion happens. */
export const toPaise = (rupees: number) => Math.round(rupees * 100);
export const toRupees = (paise: number) => paise / 100;

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export function formatINR(paise: number | null | undefined, opts: { compact?: boolean } = {}) {
  const v = (paise ?? 0) / 100;
  if (opts.compact) {
    if (Math.abs(v) >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(2)} Cr`;
    if (Math.abs(v) >= 1_00_000) return `₹${(v / 1_00_000).toFixed(2)} L`;
    if (Math.abs(v) >= 1_000) return `₹${(v / 1_000).toFixed(1)}k`;
  }
  return Number.isInteger(v) ? inr0.format(v) : inr.format(v);
}

/** percent from basis points, e.g. 1250 → "12.5%" */
// Number() drops trailing decimal zeros (12.50 → 12.5) without touching whole numbers (20 stays 20).
export const bpsToPercent = (bps: number) => `${Number((bps / 100).toFixed(2))}%`;

/** Apply basis points to an amount, rounding half up to the nearest paisa. */
export const applyBps = (amount: number, bps: number) => Math.round((amount * bps) / 10_000);

export function discountPercent(mrp: number, price: number) {
  if (mrp <= 0 || price >= mrp) return 0;
  return Math.round(((mrp - price) / mrp) * 100);
}
