import { z } from "zod";
import { api } from "@/server/http";
import { resetPassword } from "@/server/services/auth";
import { createSessionCookie } from "@/server/auth/session";
import { ROLE_HOME as HOME } from "@/server/auth/jwt";

/** Set a new password with the emailed code, then sign in (other sessions are signed out). */
export const POST = api(
  {
    body: z.object({ email: z.email().max(120), code: z.string().regex(/^\d{6}$/, "Code must be 6 digits"), newPassword: z.string().min(8).max(100) }),
    rateLimit: { name: "pw-reset", limit: 10 },
  },
  async ({ body, ip }) => {
    const user = await resetPassword(body.email, body.code, body.newPassword, ip);
    await createSessionCookie(user);
    return { user: { id: user.id, name: user.name, role: user.role }, redirect: HOME[user.role] };
  },
);
