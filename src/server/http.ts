import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError, type ZodType } from "zod";
import { AppError, forbidden, tooMany, unauthorized } from "./errors";
import { getSessionUser, type SessionUser } from "./auth/session";
import type { Role } from "./auth/jwt";
import { rateLimit } from "./rate-limit";
import { Prisma } from "@/generated/prisma/client";

export interface HandlerContext<B, Q> {
  req: NextRequest;
  user: SessionUser | null;
  params: Record<string, string>;
  body: B;
  query: Q;
  ip: string;
}

export interface AuthedContext<B, Q> extends HandlerContext<B, Q> {
  user: SessionUser;
}

interface Options<B extends ZodType | undefined, Q extends ZodType | undefined> {
  /** Roles allowed. Omit for public endpoints. */
  roles?: Role[];
  body?: B;
  query?: Q;
  /** requests per minute per (ip|user) for this route */
  rateLimit?: { name: string; limit: number; windowMs?: number };
  /** return raw Response from handler instead of JSON envelope */
  raw?: boolean;
}

type Infer<T> = T extends ZodType ? z.infer<T> : undefined;
type Ctx<R, B, Q> = R extends Role[] ? AuthedContext<B, Q> : HandlerContext<B, Q>;

export function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

export function api<
  B extends ZodType | undefined = undefined,
  Q extends ZodType | undefined = undefined,
  R extends Role[] | undefined = undefined,
>(
  opts: Options<B, Q> & { roles?: R },
  handler: (ctx: Ctx<R, Infer<B>, Infer<Q>>) => Promise<unknown>,
) {
  return async (req: NextRequest, route?: { params?: Promise<Record<string, string>> }) => {
    try {
      const ip = clientIp(req);
      const user = await getSessionUser();
      if (opts.roles) {
        if (!user) throw unauthorized();
        if (!opts.roles.includes(user.role)) throw forbidden();
      }
      if (opts.rateLimit) {
        const key = `${opts.rateLimit.name}:${user?.id ?? ip}`;
        const r = rateLimit(key, opts.rateLimit.limit, opts.rateLimit.windowMs ?? 60_000);
        if (!r.ok) throw tooMany();
      }
      const params = (await route?.params) ?? {};
      let body: unknown = undefined;
      if (opts.body) {
        let json: unknown = {};
        const text = await req.text();
        if (text) {
          try {
            json = JSON.parse(text);
          } catch {
            throw new AppError(400, "INVALID_JSON", "Request body must be valid JSON");
          }
        }
        body = opts.body.parse(json);
      }
      let query: unknown = undefined;
      if (opts.query) {
        query = opts.query.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
      }
      const result = await handler({ req, user, params, body, query, ip } as Ctx<R, Infer<B>, Infer<Q>>);
      if (opts.raw && result instanceof Response) return result;
      if (result instanceof Response) return result;
      return NextResponse.json({ data: result ?? null });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown) {
  if (err instanceof AppError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      { status: err.status },
    );
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: err.issues[0] ? `${err.issues[0].path.join(".") || "input"}: ${err.issues[0].message}` : "Invalid input",
          details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      },
      { status: 400 },
    );
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return NextResponse.json(
        { error: { code: "DUPLICATE", message: "A record with these details already exists", details: err.meta } },
        { status: 409 },
      );
    }
    if (err.code === "P2025") {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Record not found" } }, { status: 404 });
    }
  }
  console.error("[api] unhandled error", err);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } },
    { status: 500 },
  );
}

// Common zod helpers
export const zId = z.string().min(1).max(64);
export const zPhone = z
  .string()
  .trim()
  .transform((v) => {
    const digits = v.replace(/\D/g, "");
    // Strip a country code / trunk prefix only when present (never from a bare 10-digit number).
    if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
    if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
    return digits;
  })
  .pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"));
export const zPincode = z.string().trim().regex(/^\d{6}$/, "Enter a valid 6-digit pincode");
export const zPaise = z.number().int().min(0).max(100_000_000);
export const zPage = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export const zText = (max = 200) => z.string().trim().max(max);
export const zOptText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export function paginate(page: number, pageSize: number) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}
