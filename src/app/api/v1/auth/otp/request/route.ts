import { z } from "zod";
import { api, zPhone } from "@/server/http";
import { requestOtp } from "@/server/services/auth";

export const POST = api(
  { body: z.object({ phone: zPhone }), rateLimit: { name: "otp-request", limit: 5 } },
  async ({ body }) => requestOtp(body.phone),
);
