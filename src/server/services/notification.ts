import "server-only";
import { db } from "@/server/db";
import { publish } from "@/server/realtime/bus";
import { sendPush } from "@/server/integrations/fcm";
import type { Prisma } from "@/generated/prisma/client";

export type NotificationType =
  | "ORDER_NEW"
  | "ORDER_CANCELLED"
  | "ORDER_STATUS"
  | "PAYMENT_CONFIRMED"
  | "PAYMENT_FAILED"
  | "LOW_STOCK"
  | "PICKUP"
  | "DELIVERY_ISSUE"
  | "SHIPMENT_EXCEPTION"
  | "REFUND"
  | "SHOP"
  | "SUPPORT"
  | "MODIFICATION";

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
  link?: string;
}

export async function notifyUsers(userIds: string[], n: NotifyInput) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return;
  const data = { ...(n.data ?? {}), ...(n.link ? { link: n.link } : {}) };
  const created = await db.$transaction(
    ids.map((userId) =>
      db.notification.create({
        data: { userId, type: n.type, title: n.title, body: n.body, data: data as Prisma.InputJsonValue },
      }),
    ),
  );
  for (const row of created) {
    publish(row.userId, {
      type: "notification",
      payload: { id: row.id, type: row.type, title: row.title, body: row.body, data, createdAt: row.createdAt.toISOString() },
    });
  }
  // Push is best effort and must never block business flows.
  void (async () => {
    try {
      const tokens = await db.deviceToken.findMany({ where: { userId: { in: ids } } });
      const { invalidTokens } = await sendPush(
        tokens.map((t) => t.token),
        { title: n.title, body: n.body, data, link: n.link, channel: n.type === "ORDER_NEW" ? "orders" : "general" },
      );
      if (invalidTokens.length) await db.deviceToken.deleteMany({ where: { token: { in: invalidTokens } } });
    } catch (e) {
      console.warn("[notify] push failed", e);
    }
  })();
}

/** Lightweight live-refresh signal (no persisted notification). */
export function signalUsers(userIds: string[], type: string, payload: Record<string, unknown>) {
  for (const id of new Set(userIds)) publish(id, { type, payload });
}

export async function shopOwnerUserIds(shopId: string) {
  const shop = await db.shop.findUnique({ where: { id: shopId }, select: { owner: { select: { userId: true } } } });
  return shop?.owner ? [shop.owner.userId] : [];
}

export async function customerUserId(customerId: string) {
  const c = await db.customer.findUnique({ where: { id: customerId }, select: { userId: true } });
  return c?.userId ?? null;
}

export async function adminUserIds() {
  const admins = await db.user.findMany({
    where: { role: "SUPER_ADMIN", status: "ACTIVE", deletedAt: null },
    select: { id: true },
  });
  return admins.map((a) => a.id);
}

export async function notifyShop(shopId: string, n: NotifyInput) {
  await notifyUsers(await shopOwnerUserIds(shopId), n);
}

export async function notifyCustomer(customerId: string, n: NotifyInput) {
  const uid = await customerUserId(customerId);
  if (uid) await notifyUsers([uid], n);
}

export async function notifyAdmins(n: NotifyInput) {
  await notifyUsers(await adminUserIds(), n);
}
