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

export async function uploadImage(file: File, folder: "products" | "shops" | "categories" | "banners" | "platform") {
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

  // Local disk (development). Files land in /public/uploads and are served statically.
  const dir = path.join(process.cwd(), "public", "uploads", folder);
  await mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.${kind.ext}`;
  await writeFile(path.join(dir, name), buf);
  return { url: `/uploads/${folder}/${name}` };
}
