import "server-only";
import type { DbOrTx } from "@/server/db";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";

export interface Actor {
  id: string | null;
  role: string; // SUPER_ADMIN | SHOP_OWNER | CUSTOMER | SYSTEM
}

export const SYSTEM_ACTOR: Actor = { id: null, role: "SYSTEM" };

export async function audit(
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string | null,
  change: { before?: unknown; after?: unknown; ip?: string } = {},
  client: DbOrTx = db,
) {
  try {
    await client.auditLog.create({
      data: {
        actorId: actor.id,
        actorRole: actor.role,
        action,
        entityType,
        entityId,
        before: (change.before ?? undefined) as Prisma.InputJsonValue | undefined,
        after: (change.after ?? undefined) as Prisma.InputJsonValue | undefined,
        ip: change.ip,
      },
    });
  } catch (e) {
    // Audit failures must never break business flows, but must be visible.
    console.error("[audit] failed to write audit log", action, entityType, entityId, e);
  }
}
