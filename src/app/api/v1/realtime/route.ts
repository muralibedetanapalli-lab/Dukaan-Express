import { getSessionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { subscribe, type RealtimeEvent } from "@/server/realtime/bus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Server-Sent Events stream for the signed-in user. Delivers in-process events instantly and
 * polls the Notification table every 10 s so events raised on other instances still arrive.
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const encoder = new TextEncoder();
  let lastSeen = new Date();
  let closed = false;
  const sentIds = new Set<string>();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: RealtimeEvent) => {
        if (closed) return;
        const id = (event.payload as { id?: string }).id;
        if (id) {
          if (sentIds.has(id)) return;
          sentIds.add(id);
        }
        controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`));
      };
      controller.enqueue(encoder.encode(`retry: 5000\nevent: ready\ndata: {}\n\n`));
      const unsubscribe = subscribe(user.id, send);

      const poll = setInterval(async () => {
        try {
          const fresh = await db.notification.findMany({
            where: { userId: user.id, createdAt: { gt: lastSeen } },
            orderBy: { createdAt: "asc" },
            take: 20,
          });
          for (const n of fresh) {
            send({ type: "notification", payload: { id: n.id, type: n.type, title: n.title, body: n.body, data: n.data, createdAt: n.createdAt.toISOString() } });
            lastSeen = n.createdAt;
          }
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          /* transient DB errors are retried on the next tick */
        }
      }, 10_000);

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(poll);
        unsubscribe();
        try {
          controller.close();
        } catch {}
      };
      req.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
