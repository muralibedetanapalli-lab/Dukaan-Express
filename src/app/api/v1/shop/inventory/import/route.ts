import { api } from "@/server/http";
import { badRequest } from "@/server/errors";
import { activeShopFor } from "@/server/services/inventory";
import { importInventory } from "@/server/services/inventory-import";

/**
 * multipart/form-data: file=<.xlsx>, dryRun=true|false.
 * dryRun=true previews what would change; dryRun=false applies it. Rows are processed independently:
 * a bad row is reported and skipped, the rest are saved.
 */
export const POST = api({ roles: ["SHOP_OWNER"], rateLimit: { name: "inventory-import", limit: 20 } }, async ({ req, user }) => {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw badRequest("Choose an Excel file to upload");
  if (!/\.xlsx$/i.test(file.name)) throw badRequest("Upload an Excel .xlsx file");
  const { shop } = await activeShopFor(user);
  return importInventory(shop.id, user, file, String(form?.get("dryRun")) !== "false");
});
