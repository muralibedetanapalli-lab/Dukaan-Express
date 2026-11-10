import { z } from "zod";
import { api } from "@/server/http";
import { db } from "@/server/db";
import { badRequest } from "@/server/errors";
import { hashPassword, passwordPolicy, verifyPassword } from "@/server/auth/password";
import { createSessionCookie } from "@/server/auth/session";
import { audit } from "@/server/services/audit";

export const POST = api(
  {
    roles: ["SHOP_OWNER", "SUPER_ADMIN"],
    body: z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(100) }),
    rateLimit: { name: "pw-change", limit: 5 },
  },
  async ({ user, body }) => {
    const u = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!u.passwordHash || !(await verifyPassword(body.currentPassword, u.passwordHash))) throw badRequest("Current password is incorrect");
    if (!passwordPolicy.test(body.newPassword)) throw badRequest(passwordPolicy.message);
    const updated = await db.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(body.newPassword), sessionVersion: { increment: 1 } },
    });
    await createSessionCookie(updated);
    await audit({ id: user.id, role: user.role }, "user.password_change", "User", user.id);
    return { ok: true };
  },
);
