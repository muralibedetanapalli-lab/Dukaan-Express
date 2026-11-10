import "dotenv/config";

// Integration tests run against a dedicated database and always use sandbox adapters.
if (!process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL must be set to run tests");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
for (const k of [
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "SHIPROCKET_EMAIL",
  "SHIPROCKET_PASSWORD",
  "SHIPROCKET_WEBHOOK_TOKEN",
  "GOOGLE_MAPS_API_KEY",
  "FCM_PROJECT_ID",
  "SMS_PROVIDER",
  "CLOUDINARY_CLOUD_NAME",
]) {
  process.env[k] = "";
}
process.env.RAZORPAY_WEBHOOK_SECRET = "test-webhook-secret";
process.env.JWT_SECRET ||= "test-secret-test-secret-test-secret-123456";
