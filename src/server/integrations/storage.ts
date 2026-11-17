import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env, integrationModes } from "@/server/env";
import { badRequest, upstream } from "@/server/errors";

const MAX_BYTES = 5 * 1024 * 1024;

/** Detect image type from magic bytes — never trust the client-provided MIME type or extension. */
export function sniffImage(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return { mime: "image/png", ext: "png" };
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP")
    return { mime: "image/webp", ext: "webp" };
  if (buf.subarray(0, 6).toString("ascii") === "GIF89a" || buf.subarray(0, 6).toString("ascii") === "GIF87a")
    return { mime: "image/gif", ext: "gif" };
  return null;
}

export async function uploadImage(file: File, folder: "products" | "shops" | "categories" | "banners" | "platform" | "payouts") {
  if (file.size > MAX_BYTES) throw badRequest("Image must be 5 MB or smaller");
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = sniffImage(buf);
  if (!kind) throw badRequest("Only JPEG, PNG, WebP or GIF images are allowed");

  if (integrationModes().storage === "live") {
    const e = env();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const fullFolder = `dukaan-express/${folder}`;
    const signature = createHash("sha1")
      .update(`folder=${fullFolder}&timestamp=${timestamp}${e.CLOUDINARY_API_SECRET}`)
      .digest("hex");
    const form = new FormData();
    form.set("file", new Blob([buf], { type: kind.mime }));
    form.set("api_key", e.CLOUDINARY_API_KEY!);
    form.set("timestamp", timestamp);
    form.set("folder", fullFolder);
    form.set("signature", signature);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${e.CLOUDINARY_CLOUD_NAME}/image/upload`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    const json = (await res.json()) as { secure_url?: string; error?: { message: string } };
    if (!res.ok || !json.secure_url) throw upstream(`Image upload failed: ${json.error?.message ?? res.status}`);
    return { url: json.secure_url };
  }

  // Container disks are ephemeral: refuse silently-lost uploads in production.
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_LOCAL_UPLOADS !== "true") {
    throw badRequest("Image storage is not configured. Set the CLOUDINARY_* environment variables to enable uploads.");
  }

  // Local disk (development). Files land in /public/uploads and are served statically.
  const dir = path.join(process.cwd(), "public", "uploads", folder);
  await mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.${kind.ext}`;
  await writeFile(path.join(dir, name), buf);
  return { url: `/uploads/${folder}/${name}` };
}

// ───────────────────────────── Private documents (rider KYC) ─────────────────────────────

/**
 * Sensitive images (ID documents). Never stored at a public URL:
 *  - live: Cloudinary "authenticated" assets — fetchable only through a URL signed with the API secret;
 *  - dev:  files under .local/private-uploads (not served by the web server).
 * The returned reference ("cld:<public_id>.<ext>" or "local:<file>") is resolved by readPrivateDocument,
 * which the app streams only to people allowed to see it.
 */
export async function uploadPrivateDocument(file: File, folder: "rider-kyc"): Promise<string> {
  if (file.size > MAX_BYTES) throw badRequest("Image must be 5 MB or smaller");
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = sniffImage(buf);
  if (!kind || kind.mime === "image/gif") throw badRequest("Upload a JPEG, PNG or WebP photo");

  if (integrationModes().storage === "live") {
    const e = env();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const fullFolder = `dukaan-express/${folder}`;
    // Parameters are signed in alphabetical order.
    const signature = createHash("sha1").update(`folder=${fullFolder}&timestamp=${timestamp}&type=authenticated${e.CLOUDINARY_API_SECRET}`).digest("hex");
    const form = new FormData();
    form.set("file", new Blob([buf], { type: kind.mime }));
    form.set("api_key", e.CLOUDINARY_API_KEY!);
    form.set("timestamp", timestamp);
    form.set("folder", fullFolder);
    form.set("type", "authenticated");
    form.set("signature", signature);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${e.CLOUDINARY_CLOUD_NAME}/image/upload`, { method: "POST", body: form, signal: AbortSignal.timeout(30_000) });
    const json = (await res.json()) as { public_id?: string; format?: string; error?: { message: string } };
    if (!res.ok || !json.public_id) throw upstream(`Upload failed: ${json.error?.message ?? res.status}`);
    return `cld:${json.public_id}.${json.format ?? kind.ext}`;
  }

  if (process.env.NODE_ENV === "production" && process.env.ALLOW_LOCAL_UPLOADS !== "true") {
    throw badRequest("Document storage is not configured. Set the CLOUDINARY_* environment variables.");
  }
  const dir = path.join(process.cwd(), ".local", "private-uploads", folder);
  await mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.${kind.ext}`;
  await writeFile(path.join(dir, name), buf);
  return `local:${folder}/${name}`;
}

const MIME_BY_EXT: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** Load a private document's bytes for an authorised viewer. */
export async function readPrivateDocument(ref: string): Promise<{ body: Buffer; mime: string } | null> {
  const ext = ref.split(".").pop()?.toLowerCase() ?? "jpg";
  const mime = MIME_BY_EXT[ext] ?? "application/octet-stream";
  if (ref.startsWith("cld:")) {
    const e = env();
    if (!e.CLOUDINARY_CLOUD_NAME || !e.CLOUDINARY_API_SECRET) return null;
    const source = ref.slice(4); // public_id.ext
    const sig = createHash("sha1").update(source + e.CLOUDINARY_API_SECRET).digest("base64").replace(/\+/g, "-").replace(/\//g, "_").slice(0, 8);
    const url = `https://res.cloudinary.com/${e.CLOUDINARY_CLOUD_NAME}/image/authenticated/s--${sig}--/${source}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    return { body: Buffer.from(await res.arrayBuffer()), mime };
  }
  if (ref.startsWith("local:")) {
    const rel = ref.slice(6);
    if (rel.includes("..")) return null;
    const { readFile } = await import("node:fs/promises");
    try {
      return { body: await readFile(path.join(process.cwd(), ".local", "private-uploads", rel)), mime };
    } catch {
      return null;
    }
  }
  return null;
}
