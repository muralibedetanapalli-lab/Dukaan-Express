import { z } from "zod";
import { api } from "@/server/http";
import { acceptAgreement } from "@/server/services/agreement";

/** Public: sign the agreement with the emailed code. Activates the shop. */
export const POST = api(
  {
    rateLimit: { name: "agreement-accept", limit: 10 },
    body: z.object({
      name: z.string().trim().min(2, "Type your full name").max(80),
      code: z
        .string()
        .trim()
        .regex(/^\d{6}$/, "Enter the 6-digit code"),
      agree: z.literal(true, { error: "Tick the box to agree to the terms" }),
    }),
  },
  async ({ params, body, ip, req }) =>
    acceptAgreement(params.token, body, {
      ip,
      userAgent: req.headers.get("user-agent"),
    }),
);
