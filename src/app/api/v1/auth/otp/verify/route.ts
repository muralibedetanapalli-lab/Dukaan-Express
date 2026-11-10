import { z } from "zod";
import { api, zPhone } from "@/server/http";
import { verifyOtpAndLogin } from "@/server/services/auth";
import { createSessionCookie } from "@/server/auth/session";

export const POST = api(
  {
    body: z.object({
      phone: zPhone,
      otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
      name: z.string().trim().max(80).optional(),
      email: z.email().optional().or(z.literal("")),
    }),
    rateLimit: { name: "otp-verify", limit: 10 },
  },
  async ({ body }) => {
    const { user, isNew } = await verifyOtpAndLogin(body.phone, body.otp, { name: body.name, email: body.email || null });
    await createSessionCookie(user);
    return { user: { id: user.id, name: user.name, phone: user.phone, role: user.role }, isNew, needsProfile: !user.name };
  },
);
