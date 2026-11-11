import "server-only";
import { z } from "zod";

const blank = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  APP_URL: z.string().default("http://localhost:3000"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(168),

  CASHFREE_APP_ID: blank,
  CASHFREE_SECRET_KEY: blank,
  CASHFREE_ENV: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.enum(["sandbox", "production"]).default("sandbox")),

  SHIPROCKET_EMAIL: blank,
  SHIPROCKET_PASSWORD: blank,
  SHIPROCKET_BASE_URL: z.string().default("https://apiv2.shiprocket.in/v1/external"),
  SHIPROCKET_WEBHOOK_TOKEN: blank,
  SHIPROCKET_CHANNEL_ID: blank,

  GOOGLE_MAPS_API_KEY: blank,

  FCM_PROJECT_ID: blank,
  FCM_CLIENT_EMAIL: blank,
  FCM_PRIVATE_KEY: blank,

  SMS_PROVIDER: blank,
  SMS_API_KEY: blank,
  SMS_SENDER_ID: blank,
  SMS_TEMPLATE_ID: blank,

  CLOUDINARY_CLOUD_NAME: blank,
  CLOUDINARY_API_KEY: blank,
  CLOUDINARY_API_SECRET: blank,
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid environment configuration — ${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** Which integrations run against real providers vs. isolated sandbox mocks. */
export function integrationModes() {
  const e = env();
  return {
    cashfree: e.CASHFREE_APP_ID && e.CASHFREE_SECRET_KEY ? "live" : "mock",
    shiprocket: e.SHIPROCKET_EMAIL && e.SHIPROCKET_PASSWORD ? "live" : "mock",
    maps: e.GOOGLE_MAPS_API_KEY ? "live" : "mock",
    fcm: e.FCM_PROJECT_ID && e.FCM_CLIENT_EMAIL && e.FCM_PRIVATE_KEY ? "live" : "mock",
    sms: e.SMS_PROVIDER && e.SMS_API_KEY ? "live" : "mock",
    storage: e.CLOUDINARY_CLOUD_NAME && e.CLOUDINARY_API_KEY && e.CLOUDINARY_API_SECRET ? "live" : "mock",
  } as const;
}
