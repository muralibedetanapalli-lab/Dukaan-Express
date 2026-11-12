import { z } from "zod";
import { api } from "@/server/http";
import { customerLogin } from "@/server/services/auth";
import { createSessionCookie } from "@/server/auth/session";

/** Customer login: email or 10-digit mobile number + password. */
export const POST = api(
  { body: z.object({ identifier: z.string().trim().min(3).max(120), password: z.string().min(1).max(200) }), rateLimit: { name: "customer-login", limit: 10 } },
  async ({ body, ip }) => {
    const user = await customerLogin(body.identifier, body.password, ip);
    await createSessionCookie(user);
    return { user: { id: user.id, name: user.name, role: user.role }, redirect: "/" };
  },
);
