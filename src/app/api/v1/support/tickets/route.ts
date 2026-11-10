import { randomBytes } from "node:crypto";
import { z } from "zod";
import { api } from "@/server/http";
import { db } from "@/server/db";
import { notFound } from "@/server/errors";
import { notifyAdmins } from "@/server/services/notification";

export const GET = api({ roles: ["CUSTOMER"] }, async ({ user }) => ({
  tickets: await db.supportTicket.findMany({
    where: { customerId: user.customerId! },
    orderBy: { createdAt: "desc" },
    include: { order: { select: { orderNumber: true } } },
  }),
}));

export const POST = api(
  {
    roles: ["CUSTOMER"],
    body: z.object({
      orderId: z.string().optional().nullable(),
      category: z.enum(["ORDER", "PAYMENT", "DELIVERY", "REFUND", "OTHER"]),
      subject: z.string().trim().min(3).max(120),
      message: z.string().trim().min(5).max(2000),
    }),
    rateLimit: { name: "ticket", limit: 5 },
  },
  async ({ user, body }) => {
    if (body.orderId) {
      const o = await db.order.findFirst({ where: { id: body.orderId, customerId: user.customerId! } });
      if (!o) throw notFound("Order");
    }
    const ticket = await db.supportTicket.create({
      data: {
        ticketNumber: `TK${randomBytes(4).toString("hex").toUpperCase()}`,
        customerId: user.customerId!,
        orderId: body.orderId ?? null,
        category: body.category,
        subject: body.subject,
        message: body.message,
      },
    });
    await notifyAdmins({ type: "SUPPORT", title: `New ticket ${ticket.ticketNumber}`, body: body.subject, link: "/admin/support" });
    return ticket;
  },
);
