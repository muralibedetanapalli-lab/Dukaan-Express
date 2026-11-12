import { z } from "zod";
import { api } from "@/server/http";
import { sendSignupCode } from "@/server/services/auth";

/** Signup step 1: email a 6-digit verification code. */
export const POST = api({ body: z.object({ email: z.email().max(120) }), rateLimit: { name: "signup-code", limit: 5 } }, async ({ body }) => sendSignupCode(body.email));
