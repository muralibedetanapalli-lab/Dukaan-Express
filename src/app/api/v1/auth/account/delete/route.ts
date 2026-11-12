import { z } from "zod";
import { api } from "@/server/http";
import { clearSessionCookie } from "@/server/auth/session";
import { deleteCustomerAccount } from "@/server/services/auth";

/** Customer deletes their own account (password re-entry required). */
export const POST = api(
  { roles: ["CUSTOMER"], body: z.object({ password: z.string().min(1).max(200) }), rateLimit: { name: "account-delete", limit: 5 } },
  async ({ user, body, ip }) => {
    await deleteCustomerAccount(user.id, body.password, ip);
    await clearSessionCookie();
    return { deleted: true };
  },
);
