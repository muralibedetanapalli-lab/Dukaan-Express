import "dotenv/config";

// Integration tests run against a dedicated database and always use sandbox adapters.
if (!process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL must be set to run tests");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
for (const k of [
  "CASHFREE_APP_ID",
  "CASHFREE_ENV",
  // Email stays in mock mode so tests never send real mail (codes are returned to the caller instead).
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASS",
  "GOOGLE_MAPS_API_KEY",
  "FCM_PROJECT_ID",
  "SMS_PROVIDER",
  "CLOUDINARY_CLOUD_NAME",
]) {
  process.env[k] = "";
}
// Only the secret is set: webhook signatures can be verified while payments stay in sandbox mode.
process.env.CASHFREE_SECRET_KEY = "test-webhook-secret";
process.env.JWT_SECRET ||= "test-secret-test-secret-test-secret-123456";
