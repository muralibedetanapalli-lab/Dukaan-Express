import "server-only";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { notifyShop, notifyUsers } from "./notification";

/**
 * Monthly "star" badges (months in India time).
 *  - Shops compete within their shop category, riders within their area.
 *  - Shop score  = delivered × (0.5 + 0.5 × rating/5) − 2 × orders rejected or ignored by the shop.
 *    Rating = that month's average review; else the shop's overall rating; else a neutral 4★.
 *  - Rider score = delivered × (0.5 + 0.5 × on-time share) − 2 × failed delivery attempts.
 *    On time = delivered within the promised ETA + 10 minutes of the order being placed.
 *  - At least MIN_DELIVERED deliveries in the month to qualify.
 *  - Last month's winners hold the star for the whole current month; this month's ranking is a live leaderboard.
 */

export const MIN_DELIVERED = 3;
const IST_MS = 5.5 * 3600_000;
const ON_TIME_GRACE_MIN = 10;

export type Period = string; // "YYYY-MM"

export function periodOf(d: Date): Period {
  const t = new Date(d.getTime() + IST_MS);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
}
export function rangeOf(period: Period) {
  const [y, m] = period.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1) - IST_MS), end: new Date(Date.UTC(y, m, 1) - IST_MS) };
}
export function shiftPeriod(period: Period, months: number): Period {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
export const currentPeriod = () => periodOf(new Date());
export const previousPeriod = () => shiftPeriod(currentPeriod(), -1);
export function periodLabel(period: Period) {
  const { start } = rangeOf(period);
  return new Date(start.getTime() + IST_MS).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export interface ShopEntry {
  shopId: string;
  name: string;
  delivered: number;
  rejected: number;
  rating: number | null;
  score: number;
  qualifies: boolean;
  rank: number;
}
export interface RiderEntry {
  riderId: string;
  name: string;
  delivered: number;
  onTimePct: number | null;
  failed: number;
  score: number;
  qualifies: boolean;
  rank: number;
}
export interface Board<E> {
  categoryKey: string;
  categoryName: string;
  entries: E[];
}

function rank<E extends { score: number; qualifies: boolean; rank: number }>(entries: E[]) {
  entries.sort((a, b) => Number(b.qualifies) - Number(a.qualifies) || b.score - a.score);
  entries.forEach((e, i) => (e.rank = i + 1));
  return entries;
}

// ───────────────────────────── Shops ─────────────────────────────

export async function shopLeaderboards(period: Period): Promise<Board<ShopEntry>[]> {
  const { start, end } = rangeOf(period);
  const [shops, delivered, rejected, reviews] = await Promise.all([
    db.shop.findMany({
      where: { deletedAt: null, approvalStatus: "APPROVED" },
      select: { id: true, name: true, rating: true, ratingCount: true, categoryId: true, category: { select: { name: true } } },
    }),
    db.order.groupBy({ by: ["shopId"], where: { status: "DELIVERED", deliveredAt: { gte: start, lt: end } }, _count: true }),
    db.order.groupBy({ by: ["shopId"], where: { status: "SHOP_REJECTED", cancelledAt: { gte: start, lt: end } }, _count: true }),
    db.review.groupBy({ by: ["shopId"], where: { createdAt: { gte: start, lt: end } }, _avg: { rating: true }, _count: true }),
  ]);
  const d = new Map(delivered.map((x) => [x.shopId, x._count]));
  const r = new Map(rejected.map((x) => [x.shopId, x._count]));
  const rv = new Map(reviews.map((x) => [x.shopId, x._avg.rating]));
  const boards = new Map<string, Board<ShopEntry>>();
  for (const s of shops) {
    const del = d.get(s.id) ?? 0;
    const rej = r.get(s.id) ?? 0;
    if (!del && !rej) continue;
    const rating = rv.get(s.id) ?? (s.ratingCount > 0 ? s.rating : null);
    const score = round1(del * (0.5 + 0.5 * ((rating ?? 4) / 5)) - 2 * rej);
    const key = s.categoryId ?? "none";
    if (!boards.has(key)) boards.set(key, { categoryKey: key, categoryName: s.category?.name ?? "Other shops", entries: [] });
    boards.get(key)!.entries.push({ shopId: s.id, name: s.name, delivered: del, rejected: rej, rating: rating != null ? round1(rating) : null, score, qualifies: del >= MIN_DELIVERED, rank: 0 });
  }
  return [...boards.values()].map((b) => ({ ...b, entries: rank(b.entries) })).sort((a, b) => a.categoryName.localeCompare(b.categoryName));
}

// ───────────────────────────── Riders ─────────────────────────────

export async function riderLeaderboards(period: Period): Promise<Board<RiderEntry>[]> {
  const { start, end } = rangeOf(period);
  const [riders, delivered, failed] = await Promise.all([
    db.rider.findMany({
      where: { kycStatus: "APPROVED", user: { deletedAt: null } },
      select: { id: true, serviceAreaId: true, serviceArea: { select: { city: true } }, user: { select: { name: true } } },
    }),
    db.shipment.findMany({
      where: { mode: "RIDER", status: "DELIVERED", riderId: { not: null }, deliveredAt: { gte: start, lt: end } },
      select: { riderId: true, deliveredAt: true, order: { select: { placedAt: true, etaMinutes: true } } },
    }),
    db.shipmentTrackingEvent.findMany({
      where: { status: "FAILED_ATTEMPT", occurredAt: { gte: start, lt: end }, shipment: { riderId: { not: null } } },
      select: { shipment: { select: { riderId: true } } },
    }),
  ]);
  const del = new Map<string, { n: number; onTime: number }>();
  for (const s of delivered) {
    const e = del.get(s.riderId!) ?? { n: 0, onTime: 0 };
    e.n++;
    if (s.deliveredAt!.getTime() - s.order.placedAt.getTime() <= (s.order.etaMinutes + ON_TIME_GRACE_MIN) * 60_000) e.onTime++;
    del.set(s.riderId!, e);
  }
  const fail = new Map<string, number>();
  for (const f of failed) fail.set(f.shipment.riderId!, (fail.get(f.shipment.riderId!) ?? 0) + 1);

  const boards = new Map<string, Board<RiderEntry>>();
  for (const r of riders) {
    const d = del.get(r.id);
    const fl = fail.get(r.id) ?? 0;
    if (!d && !fl) continue;
    const n = d?.n ?? 0;
    const onTimeRate = n ? d!.onTime / n : 0;
    const score = round1(n * (0.5 + 0.5 * onTimeRate) - 2 * fl);
    const key = r.serviceAreaId ?? "none";
    if (!boards.has(key)) boards.set(key, { categoryKey: key, categoryName: r.serviceArea?.city ?? "Other riders", entries: [] });
    boards.get(key)!.entries.push({ riderId: r.id, name: r.user.name ?? "Rider", delivered: n, onTimePct: n ? Math.round(onTimeRate * 100) : null, failed: fl, score, qualifies: n >= MIN_DELIVERED, rank: 0 });
  }
  return [...boards.values()].map((b) => ({ ...b, entries: rank(b.entries) })).sort((a, b) => a.categoryName.localeCompare(b.categoryName));
}

// ───────────────────────────── Awarding ─────────────────────────────

const awarded = new Set<Period>();

/** Award the stars for a finished month (idempotent: one badge per kind × month × category). */
export async function awardMonth(period: Period) {
  if (period >= currentPeriod()) throw new Error("Badges are awarded only for finished months");
  const [shopBoards, riderBoards] = await Promise.all([shopLeaderboards(period), riderLeaderboards(period)]);
  let created = 0;
  const label = periodLabel(period);
  for (const b of shopBoards) {
    const top = b.entries[0];
    if (!top?.qualifies || top.score <= 0) continue;
    const ok = await createBadge({ kind: "SHOP", period, categoryKey: b.categoryKey, categoryName: b.categoryName, shopId: top.shopId, score: top.score, stats: top as unknown as Prisma.InputJsonValue });
    if (ok) {
      created++;
      await notifyShop(top.shopId, { type: "SHOP", title: `⭐ Top ${b.categoryName} shop of ${label}!`, body: "Your star badge is shown to customers all this month. Keep it up!", link: "/shop" });
    }
  }
  for (const b of riderBoards) {
    const top = b.entries[0];
    if (!top?.qualifies || top.score <= 0) continue;
    const ok = await createBadge({ kind: "RIDER", period, categoryKey: b.categoryKey, categoryName: b.categoryName, riderId: top.riderId, score: top.score, stats: top as unknown as Prisma.InputJsonValue });
    if (ok) {
      created++;
      const r = await db.rider.findUnique({ where: { id: top.riderId }, select: { userId: true } });
      if (r) await notifyUsers([r.userId], { type: "SHOP", title: `⭐ Top rider in ${b.categoryName} for ${label}!`, body: "Customers see your star badge while you deliver this month.", link: "/rider" });
    }
  }
  return created;
}

async function createBadge(data: Prisma.BadgeUncheckedCreateInput) {
  try {
    await db.badge.create({ data });
    return true;
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") return false; // already awarded
    throw e;
  }
}

/** Called by maintenance: make sure last month's stars exist (cheap after the first run). */
export async function ensurePreviousMonthBadges() {
  const prev = previousPeriod();
  if (awarded.has(prev)) return 0;
  const n = await awardMonth(prev);
  awarded.add(prev);
  return n;
}

// ───────────────────────────── Current holders ─────────────────────────────

/** Badges shown right now = winners of the previous month. */
export async function currentHolders() {
  const badges = await db.badge.findMany({ where: { period: previousPeriod() } });
  return {
    period: previousPeriod(),
    shops: new Map(badges.filter((b) => b.shopId).map((b) => [b.shopId!, b])),
    riders: new Map(badges.filter((b) => b.riderId).map((b) => [b.riderId!, b])),
    all: badges,
  };
}

export async function shopStar(shopId: string) {
  return db.badge.findFirst({ where: { shopId, period: previousPeriod() } });
}
export async function riderStar(riderId: string) {
  return db.badge.findFirst({ where: { riderId, period: previousPeriod() } });
}
