import "server-only";
import { db } from "@/server/db";

/**
 * Read-only feeds for Metech ERP (Metech Solutions' accounting + CRM), pulled server-to-server with
 * ERP_API_KEY. Two feeds:
 *   parties — shops, shop owners, dealers, riders and customers (become CRM contacts/companies)
 *   events  — money events (delivered orders, refunds, shop settlements, dealer payouts,
 *             rider withdrawals, rider wallet adjustments) that become journal entries
 * Each feed walks its sources one after another, each ordered by (timestamp, id), and returns an
 * opaque cursor holding a position per source. Items may be re-sent; the ERP is idempotent.
 * Money is integer paise.
 */

type Pos = [string, string]; // [ISO timestamp, id]
type Cursor = Record<string, Pos>;

export const encodeCursor = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString("base64url");
export function decodeCursor(s: string | null | undefined): Cursor {
  if (!s) return {};
  try {
    const c = JSON.parse(Buffer.from(s, "base64url").toString("utf8")) as Cursor;
    return c && typeof c === "object" ? c : {};
  } catch {
    return {};
  }
}

/** Rows strictly after a (timestamp, id) position, for a given timestamp column. */
function after(pos: Pos | undefined, col: string) {
  if (!pos) return {};
  const ts = new Date(pos[0]);
  return { OR: [{ [col]: { gt: ts } }, { [col]: ts, id: { gt: pos[1] } }] };
}
/** Same, when the timestamp lives on the related User row. */
function afterUser(pos: Pos | undefined) {
  if (!pos) return {};
  const ts = new Date(pos[0]);
  return { OR: [{ user: { updatedAt: { gt: ts } } }, { user: { updatedAt: ts }, id: { gt: pos[1] } }] };
}

interface Source<T> {
  key: string;
  fetch: (pos: Pos | undefined, take: number) => Promise<{ item: T; pos: Pos }[]>;
}

async function walk<T>(sources: Source<T>[], cursorStr: string | null | undefined, limit: number) {
  const cursor = decodeCursor(cursorStr);
  const items: T[] = [];
  let hasMore = false;
  for (const s of sources) {
    const remaining = limit - items.length;
    if (remaining <= 0) {
      hasMore = true;
      break;
    }
    const rows = await s.fetch(cursor[s.key], remaining + 1);
    if (rows.length > remaining) hasMore = true;
    for (const r of rows.slice(0, remaining)) {
      items.push(r.item);
      cursor[s.key] = r.pos;
    }
    if (hasMore) break;
  }
  return { items, nextCursor: encodeCursor(cursor), hasMore };
}

const iso = (d: Date) => d.toISOString();
const userTs = (u: { updatedAt: Date }) => iso(u.updatedAt);
const userActive = (u: { status: string; deletedAt: Date | null }) => u.status === "ACTIVE" && !u.deletedAt;

// ───────────────────────────── Parties ─────────────────────────────

export async function partiesFeed(cursor: string | null | undefined, limit: number) {
  const userSel = { select: { name: true, email: true, phone: true, status: true, deletedAt: true, updatedAt: true } } as const;
  const sources: Source<Record<string, unknown>>[] = [
    {
      key: "SHOP",
      fetch: async (pos, take) => {
        const rows = await db.shop.findMany({ where: after(pos, "updatedAt"), include: { address: true }, orderBy: [{ updatedAt: "asc" }, { id: "asc" }], take });
        return rows.map((s) => ({
          pos: [iso(s.updatedAt), s.id] as Pos,
          item: {
            type: "SHOP",
            id: s.id,
            name: s.name,
            email: s.contactEmail,
            phone: s.contactPhone,
            gstin: s.gstNumber,
            address: s.address ? [s.address.line1, s.address.line2, s.address.landmark].filter(Boolean).join(", ") : null,
            city: s.address?.city ?? null,
            state: s.address?.state ?? null,
            pincode: s.address?.pincode ?? null,
            active: !s.deletedAt,
            links: { ownerId: s.ownerId, dealerId: s.dealerId },
            extra: { approvalStatus: s.approvalStatus, live: s.isActive, deliveryMode: s.deliveryMode, commissionBps: s.commissionBps, rating: s.rating },
            adminPath: `/admin/shops/${s.id}`,
            updatedAt: iso(s.updatedAt),
          },
        }));
      },
    },
    {
      key: "SHOP_OWNER",
      fetch: async (pos, take) => {
        const rows = await db.shopOwner.findMany({ where: afterUser(pos), include: { user: userSel }, orderBy: [{ user: { updatedAt: "asc" } }, { id: "asc" }], take });
        return rows.map((o) => ({
          pos: [userTs(o.user), o.id] as Pos,
          item: { type: "SHOP_OWNER", id: o.id, name: o.user.name ?? "", email: o.user.email, phone: o.user.phone, gstin: null, address: null, city: null, state: null, pincode: null, active: userActive(o.user), links: {}, extra: {}, adminPath: "/admin/owners", updatedAt: userTs(o.user) },
        }));
      },
    },
    {
      key: "DEALER",
      fetch: async (pos, take) => {
        const rows = await db.dealer.findMany({ where: afterUser(pos), include: { user: userSel, regions: { select: { city: true, state: true } } }, orderBy: [{ user: { updatedAt: "asc" } }, { id: "asc" }], take });
        return rows.map((d) => ({
          pos: [userTs(d.user), d.id] as Pos,
          item: {
            type: "DEALER",
            id: d.id,
            name: d.user.name ?? "",
            email: d.user.email,
            phone: d.user.phone,
            gstin: null,
            address: null,
            city: d.regions[0]?.city ?? null,
            state: d.regions[0]?.state ?? null,
            pincode: null,
            active: userActive(d.user),
            links: {},
            extra: { commissionShareBps: d.commissionShareBps, regions: d.regions.map((r) => r.city).join(", ") },
            adminPath: "/admin/dealers",
            updatedAt: userTs(d.user),
          },
        }));
      },
    },
    {
      key: "RIDER",
      fetch: async (pos, take) => {
        const rows = await db.rider.findMany({ where: afterUser(pos), include: { user: userSel, serviceArea: { select: { city: true, state: true } } }, orderBy: [{ user: { updatedAt: "asc" } }, { id: "asc" }], take });
        return rows.map((r) => ({
          pos: [userTs(r.user), r.id] as Pos,
          item: {
            type: "RIDER",
            id: r.id,
            name: r.user.name ?? "",
            email: r.user.email,
            phone: r.user.phone,
            gstin: null,
            address: null,
            city: r.serviceArea?.city ?? null,
            state: r.serviceArea?.state ?? null,
            pincode: null,
            active: userActive(r.user),
            links: { dealerId: r.dealerId, serviceArea: r.serviceArea?.city ?? null },
            extra: { kycStatus: r.kycStatus, vehicleType: r.vehicleType, rating: r.rating },
            adminPath: `/admin/riders/${r.id}`,
            updatedAt: userTs(r.user),
          },
        }));
      },
    },
    {
      key: "CUSTOMER",
      fetch: async (pos, take) => {
        const rows = await db.customer.findMany({
          where: afterUser(pos),
          include: { user: userSel, addresses: { where: { deletedAt: null }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }], take: 1, select: { city: true, state: true, pincode: true } } },
          orderBy: [{ user: { updatedAt: "asc" } }, { id: "asc" }],
          take,
        });
        return rows.map((c) => ({
          pos: [userTs(c.user), c.id] as Pos,
          item: {
            type: "CUSTOMER",
            id: c.id,
            name: c.user.name ?? "",
            email: c.user.email,
            phone: c.user.phone,
            gstin: null,
            address: null,
            city: c.addresses[0]?.city ?? null,
            state: c.addresses[0]?.state ?? null,
            pincode: c.addresses[0]?.pincode ?? null,
            active: userActive(c.user),
            links: {},
            extra: {},
            adminPath: `/admin/customers/${c.id}`,
            updatedAt: userTs(c.user),
          },
        }));
      },
    },
  ];
  return walk(sources, cursor, limit);
}

// ───────────────────────────── Money events ─────────────────────────────

export async function eventsFeed(cursor: string | null | undefined, limit: number) {
  const sources: Source<Record<string, unknown>>[] = [
    {
      // Commission rows are written exactly once, when an order is delivered.
      key: "order.delivered",
      fetch: async (pos, take) => {
        const rows = await db.commission.findMany({
          where: after(pos, "createdAt"),
          include: { order: { include: { shipment: true } }, bulkOrder: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take,
        });
        return rows.map((c) => {
          const o = c.order;
          if (!o) {
            // Shop-to-shop bulk order.
            const b = c.bulkOrder!;
            return {
              pos: [iso(c.createdAt), c.id] as Pos,
              item: {
                id: `bulk.delivered:${b.id}`,
                type: "bulk.delivered",
                occurredAt: iso(b.deliveredAt ?? c.createdAt),
                data: {
                  bulkOrderId: b.id,
                  number: b.number,
                  sellerShopId: b.sellerShopId,
                  buyerShopId: b.buyerShopId,
                  paymentMethod: b.paymentMethod,
                  fulfilment: b.fulfilment,
                  total: b.total,
                  subtotal: b.subtotal,
                  deliveryFee: b.deliveryFee,
                  commissionAmount: c.amount,
                  shopEarning: c.shopEarning,
                  dealerId: c.dealerId,
                  dealerAmount: c.dealerAmount,
                },
              },
            };
          }
          const s = o.shipment;
          return {
            pos: [iso(c.createdAt), c.id] as Pos,
            item: {
              id: `order.delivered:${o.id}`,
              type: "order.delivered",
              occurredAt: iso(o.deliveredAt ?? c.createdAt),
              data: {
                orderId: o.id,
                orderNumber: o.orderNumber,
                shopId: o.shopId,
                customerId: o.customerId,
                paymentMethod: o.paymentMethod,
                deliveryMode: s?.mode ?? null,
                riderId: s?.mode === "RIDER" ? s.riderId : null,
                total: o.total,
                subtotal: o.subtotal,
                couponDiscount: o.couponDiscount,
                deliveryFee: o.deliveryFee,
                taxAmount: o.taxAmount,
                commissionAmount: c.amount,
                shopEarning: c.shopEarning,
                riderFee: s?.mode === "RIDER" && s.riderId ? s.riderFee : 0,
                codAmount: s?.codAmount ?? 0,
                dealerId: c.dealerId,
                dealerAmount: c.dealerAmount,
              },
            },
          };
        });
      },
    },
    {
      key: "refund.processed",
      fetch: async (pos, take) => {
        const rows = await db.refund.findMany({ where: { status: "PROCESSED", ...after(pos, "updatedAt") }, include: { order: { select: { orderNumber: true, customerId: true, paymentMethod: true, commission: { select: { id: true } } } } }, orderBy: [{ updatedAt: "asc" }, { id: "asc" }], take });
        return rows.map((r) => ({
          pos: [iso(r.updatedAt), r.id] as Pos,
          item: {
            id: `refund.processed:${r.id}`,
            type: "refund.processed",
            occurredAt: iso(r.processedAt ?? r.updatedAt),
            data: { refundId: r.id, orderId: r.orderId, orderNumber: r.order.orderNumber, customerId: r.order.customerId, amount: r.amount, paymentMethod: r.order.paymentMethod, orderDelivered: Boolean(r.order.commission) },
          },
        }));
      },
    },
    {
      key: "shop_settlement.paid",
      fetch: async (pos, take) => {
        const rows = await db.shopSettlement.findMany({ where: { status: "PAID", ...after(pos, "updatedAt") }, orderBy: [{ updatedAt: "asc" }, { id: "asc" }], take });
        return rows.map((s) => ({
          pos: [iso(s.updatedAt), s.id] as Pos,
          item: { id: `shop_settlement.paid:${s.id}`, type: "shop_settlement.paid", occurredAt: iso(s.paidAt ?? s.updatedAt), data: { settlementId: s.id, shopId: s.shopId, amount: s.netPayable, orderCount: s.orderCount, reference: s.reference, method: s.payoutMethod } },
        }));
      },
    },
    {
      key: "dealer_payout.paid",
      fetch: async (pos, take) => {
        const rows = await db.dealerPayout.findMany({ where: { status: "PAID", ...after(pos, "updatedAt") }, orderBy: [{ updatedAt: "asc" }, { id: "asc" }], take });
        return rows.map((p) => ({
          pos: [iso(p.updatedAt), p.id] as Pos,
          item: { id: `dealer_payout.paid:${p.id}`, type: "dealer_payout.paid", occurredAt: iso(p.paidAt ?? p.updatedAt), data: { payoutId: p.id, dealerId: p.dealerId, amount: p.amount, orderCount: p.orderCount, reference: p.reference, method: p.payoutMethod } },
        }));
      },
    },
    {
      key: "rider_withdrawal.paid",
      fetch: async (pos, take) => {
        const rows = await db.riderWithdrawal.findMany({ where: { status: "PAID", ...after(pos, "updatedAt") }, orderBy: [{ updatedAt: "asc" }, { id: "asc" }], take });
        return rows.map((w) => ({
          pos: [iso(w.updatedAt), w.id] as Pos,
          item: { id: `rider_withdrawal.paid:${w.id}`, type: "rider_withdrawal.paid", occurredAt: iso(w.paidAt ?? w.updatedAt), data: { withdrawalId: w.id, riderId: w.riderId, amount: w.amount, reference: w.reference, method: w.payoutMethod } },
        }));
      },
    },
    {
      key: "rider_wallet.adjustment",
      fetch: async (pos, take) => {
        const rows = await db.riderWalletEntry.findMany({ where: { type: "ADJUSTMENT", ...after(pos, "createdAt") }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take });
        return rows.map((e) => ({
          pos: [iso(e.createdAt), e.id] as Pos,
          item: { id: `rider_wallet.adjustment:${e.id}`, type: "rider_wallet.adjustment", occurredAt: iso(e.createdAt), data: { entryId: e.id, riderId: e.riderId, amount: e.amount, note: e.note } },
        }));
      },
    },
  ];
  return walk(sources, cursor, limit);
}
