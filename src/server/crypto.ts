import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { env } from "@/server/env";

/**
 * Field-level encryption for sensitive values at rest (bank account numbers).
 * AES-256-GCM. Key: FIELD_ENCRYPTION_KEY if set, otherwise derived from JWT_SECRET with HKDF.
 * Never rotate either without re-encrypting stored values first.
 * Format: "v1.<iv>.<tag>.<ciphertext>" (base64url).
 */
let cachedKey: Buffer | null = null;
function key() {
  if (cachedKey) return cachedKey;
  const e = env();
  const ikm = e.FIELD_ENCRYPTION_KEY ?? e.JWT_SECRET;
  cachedKey = Buffer.from(hkdfSync("sha256", ikm, "dukaan-express", "field-encryption-v1", 32));
  return cachedKey;
}

export function encryptField(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptField(enc: string) {
  const [v, iv, tag, ct] = enc.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unsupported encrypted field format");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}
