import { z } from "zod";
import { api } from "@/server/http";
import { db } from "@/server/db";
import { conflict } from "@/server/errors";

export const GET = api({}, async ({ user }) => ({ user }));

export const PATCH = api(
  {
    roles: ["CUSTOMER", "SHOP_OWNER", "SUPER_ADMIN"],
    body: z.object({
      name: z.string().trim().min(2).max(80).optional(),
      email: z.email().optional().or(z.literal("")),
    }),
  },
  async ({ user, body }) => {
    const email = body.email === "" ? null : body.email?.toLowerCase();
    if (email) {
      const clash = await db.user.findFirst({ where: { email, NOT: { id: user.id } } });
      if (clash) throw conflict("This email is already in use");
    }
    const updated = await db.user.update({
      where: { id: user.id },
      data: { name: body.name, ...(body.email !== undefined && user.role === "CUSTOMER" ? { email } : {}) },
      select: { id: true, name: true, email: true, phone: true },
    });
    return { user: updated };
  },
);
