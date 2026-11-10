import { z } from "zod";
import { api } from "@/server/http";
import { db } from "@/server/db";
import { notifyCustomer } from "@/server/services/notification";
import { audit } from "@/server/services/audit";

export const PATCH = api(
  {
    roles: ["SUPER_ADMIN"],
    body: z.object({ status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]), resolution: z.string().trim().max(2000).optional().nullable() }),
  },
  async ({ user, params, body }) => {
    const t = await db.supportTicket.update({
      where: { id: params.id },
      data: { status: body.status, resolution: body.resolution ?? undefined, resolvedById: ["RESOLVED", "CLOSED"].includes(body.status) ? user.id : undefined },
    });
    await audit({ id: user.id, role: user.role }, "ticket.update", "SupportTicket", t.id, { after: body });
    if (body.resolution) {
      await notifyCustomer(t.customerId, { type: "SUPPORT", title: `Update on ticket ${t.ticketNumber}`, body: body.resolution, link: "/account/support" });
    }
    return t;
  },
);
