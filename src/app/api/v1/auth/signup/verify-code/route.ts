import { z } from "zod";
import { api } from "@/server/http";
import { verifySignupCode } from "@/server/services/auth";

/** Signup step 2: returns a 30-minute verificationToken proving the email was verified. */
export const POST = api(
  { body: z.object({ email: z.email().max(120), code: z.string().regex(/^\d{6}$/, "Code must be 6 digits") }), rateLimit: { name: "signup-verify", limit: 10 } },
  async ({ body }) => verifySignupCode(body.email, body.code),
);
