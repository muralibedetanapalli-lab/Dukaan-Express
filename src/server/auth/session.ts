import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { SESSION_COOKIE, signSession, verifySession, type Role } from "./jwt";

export interface SessionUser {
  id: string;
  role: Role;
  name: string | null;
  email: string | null;
  phone: string | null;
  customerId: string | null;
  shopOwnerId: string | null;
}

/** Resolve the current user from the session cookie (validated against the DB). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  return resolveToken(jar.get(SESSION_COOKIE)?.value);
});

export async function resolveToken(token: string | undefined): Promise<SessionUser | null> {
  const claims = await verifySession(token);
  if (!claims) return null;
  const user = await db.user.findUnique({
    where: { id: claims.sub },
    include: { customer: { select: { id: true } }, shopOwner: { select: { id: true } } },
  });
  if (!user || user.deletedAt || user.status !== "ACTIVE") return null;
  if (user.sessionVersion !== claims.sv || user.role !== claims.role) return null;
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
    phone: user.phone,
    customerId: user.customer?.id ?? null,
    shopOwnerId: user.shopOwner?.id ?? null,
  };
}

export async function createSessionCookie(user: { id: string; role: Role; sessionVersion: number; name: string | null }) {
  const ttl = env().SESSION_TTL_HOURS;
  const token = await signSession({ sub: user.id, role: user.role, sv: user.sessionVersion, name: user.name }, ttl);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ttl * 3600,
  });
  return token;
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
