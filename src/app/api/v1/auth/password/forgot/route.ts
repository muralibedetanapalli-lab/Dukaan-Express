import { z } from "zod";
import { api } from "@/server/http";
import { sendPasswordResetCode } from "@/server/services/auth";

/** Email a reset code. Same response whether or not the email is registered. */
export const POST = api({ body: z.object({ email: z.email().max(120) }), rateLimit: { name: "pw-forgot", limit: 5 } }, async ({ body }) => sendPasswordResetCode(body.email));
