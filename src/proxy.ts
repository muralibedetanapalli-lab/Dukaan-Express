import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession, type Role } from "@/server/auth/jwt";

/**
 * Page-level role routing (Next.js 16 "proxy", formerly middleware). This is a fast first line of
 * defence using the signed JWT only; every API route and server page re-validates the session
 * against the database (status, session version) before doing anything.
 */
const RULES: { prefix: string; roles: Role[]; login: string }[] = [
  { prefix: "/admin", roles: ["SUPER_ADMIN"], login: "/login/staff" },
  { prefix: "/shop", roles: ["SHOP_OWNER"], login: "/login/staff" },
  { prefix: "/checkout", roles: ["CUSTOMER"], login: "/login" },
  { prefix: "/orders", roles: ["CUSTOMER"], login: "/login" },
  { prefix: "/account", roles: ["CUSTOMER"], login: "/login" },
];

const HOME: Record<Role, string> = { SUPER_ADMIN: "/admin", SHOP_OWNER: "/shop", CUSTOMER: "/" };

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/login" || pathname === "/login/staff" || pathname === "/signup") {
    if (session) return NextResponse.redirect(new URL(HOME[session.role], req.url));
    return NextResponse.next();
  }

  const rule = RULES.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));
  if (!rule) {
    // Staff should not wander into the customer storefront by accident.
    if (session && session.role !== "CUSTOMER" && pathname === "/") {
      return NextResponse.redirect(new URL(HOME[session.role], req.url));
    }
    return NextResponse.next();
  }
  if (!session) {
    const url = new URL(rule.login, req.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  if (!rule.roles.includes(session.role)) {
    return NextResponse.redirect(new URL(HOME[session.role], req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|uploads|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico)$).*)"],
};
