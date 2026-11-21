import { NextResponse, type NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AppError } from "@/server/errors";
import { clientIp, errorResponse } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { eventsFeed, partiesFeed } from "@/server/services/erp-feed";

const digest = (s: string) => createHash("sha256").update(s).digest();

/** Server-to-server only: "Authorization: Bearer <ERP_API_KEY>". Disabled when ERP_API_KEY is not set. */
function checkKey(req: NextRequest) {
  const key = process.env.ERP_API_KEY?.trim();
  if (!key) throw new AppError(503, "ERP_DISABLED", "ERP integration is not enabled");
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token || !timingSafeEqual(digest(token), digest(key))) throw new AppError(401, "UNAUTHORIZED", "Invalid API key");
}

const zQuery = z.object({
  after: z.string().max(4000).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

/** Read-only feeds for Metech ERP: GET /api/v1/integrations/erp/parties and /events. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ feed: string }> }) {
  try {
    if (!rateLimit(`erp-feed:${clientIp(req)}`, 120, 60_000).ok) throw new AppError(429, "RATE_LIMITED", "Too many requests");
    checkKey(req);
    const { feed } = await ctx.params;
    const q = zQuery.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
    if (feed === "parties") return NextResponse.json({ data: await partiesFeed(q.after, q.limit) });
    if (feed === "events") return NextResponse.json({ data: await eventsFeed(q.after, q.limit) });
    throw new AppError(404, "NOT_FOUND", "Unknown feed");
  } catch (err) {
    return errorResponse(err);
  }
}
