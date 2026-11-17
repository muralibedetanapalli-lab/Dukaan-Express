import { z } from "zod";
import { api } from "@/server/http";
import { db } from "@/server/db";
import { notFound } from "@/server/errors";
import { completeDelivery, failDelivery, pickUp, releaseJob, requireRider } from "@/server/services/delivery";

/** Rider steps on their delivery (id = delivery id): give back, picked up, delivered (with code), could not deliver. */
export const POST = api(
  {
    roles: ["RIDER"],
    body: z.discriminatedUnion("action", [
      z.object({ action: z.literal("release"), reason: z.string().trim().min(3).max(200) }),
      z.object({ action: z.literal("pickup") }),
      z.object({ action: z.literal("complete"), code: z.string().trim().regex(/^\d{4}$/, "Enter the 4-digit code") }),
      z.object({ action: z.literal("failed"), reason: z.string().trim().min(3).max(300) }),
    ]),
    rateLimit: { name: "rider-delivery", limit: 30 },
  },
  async ({ user, params, body }) => {
    const s = await db.shipment.findUnique({ where: { id: params.id }, select: { orderId: true, riderId: true } });
    if (!s || s.riderId !== requireRider(user)) throw notFound("Delivery");
    if (body.action === "release") await releaseJob(user, params.id, body.reason);
    else if (body.action === "pickup") await pickUp(user, params.id);
    else if (body.action === "complete") await completeDelivery(user, s.orderId, body.code);
    else await failDelivery(user, s.orderId, body.reason);
    return { ok: true };
  },
);
