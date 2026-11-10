import bcrypt from "bcryptjs";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";

export const hashPassword = (plain: string) => bcrypt.hash(plain, 12);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function randomDigits(length: number) {
  let s = "";
  for (let i = 0; i < length; i++) s += randomInt(0, 10).toString();
  return s;
}

/** Readable temporary password, e.g. for admin-issued resets. */
export function temporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 10; i++) s += alphabet[randomInt(0, alphabet.length)];
  return `${s}!${randomInt(10, 99)}`;
}

export const passwordPolicy = {
  min: 8,
  test: (p: string) => p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p),
  message: "Password must be at least 8 characters and include letters and numbers",
};
