import { z } from "zod";
import { api, zPhone } from "@/server/http";
import { signupCustomer } from "@/server/services/auth";
import { createSessionCookie } from "@/server/auth/session";

/** Signup step 3: create the customer account (email must be verified first) and sign in. */
export const POST = api(
  {
    body: z.object({
      name: z.string().trim().min(2, "Enter your name").max(80),
      phone: zPhone,
      email: z.email().max(120),
      password: z.string().min(8).max(100),
      verificationToken: z.string().min(10).max(2000),
    }),
    rateLimit: { name: "signup", limit: 5 },
  },
  async ({ body, ip }) => {
    const user = await signupCustomer(body, ip);
    await createSessionCookie(user);
    return { user: { id: user.id, name: user.name, role: user.role }, redirect: "/" };
  },
);
