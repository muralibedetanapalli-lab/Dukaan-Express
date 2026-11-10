import { z } from "zod";
import { api } from "@/server/http";
import { db } from "@/server/db";

export const GET = api(
  { roles: ["SUPER_ADMIN"], query: z.object({ status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional() }) },
  async ({ query }) => ({
    tickets: await db.supportTicket.findMany({
      where: query.status ? { status: query.status } : {},
      orderBy: { createdAt: "desc" },
      include: { customer: { include: { user: { select: { name: true, phone: true } } } }, order: { select: { id: true, orderNumber: true, total: true, paymentStatus: true } } },
      take: 200,
    }),
  }),
);
