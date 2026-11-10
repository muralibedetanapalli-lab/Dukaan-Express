import { api } from "@/server/http";
import { badRequest } from "@/server/errors";
import { uploadImage } from "@/server/integrations/storage";

const FOLDERS = ["products", "shops", "categories", "banners", "platform"] as const;

/** multipart/form-data: file=<image>, folder=<products|shops|…>. Max 5 MB, images only (magic-byte checked). */
export const POST = api(
  { roles: ["SUPER_ADMIN", "SHOP_OWNER"], rateLimit: { name: "upload", limit: 30 } },
  async ({ req, user }) => {
    const form = await req.formData().catch(() => null);
    if (!form) throw badRequest("Expected multipart/form-data");
    const file = form.get("file");
    const folder = String(form.get("folder") ?? "products");
    if (!(file instanceof File)) throw badRequest("No file uploaded");
    if (!(FOLDERS as readonly string[]).includes(folder)) throw badRequest("Invalid folder");
    if (user.role === "SHOP_OWNER" && folder !== "products") throw badRequest("Shop owners can only upload product images");
    return uploadImage(file, folder as (typeof FOLDERS)[number]);
  },
);
