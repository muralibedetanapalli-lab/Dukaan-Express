import { api } from "@/server/http";
import { activeShopFor } from "@/server/services/inventory";
import { inventoryWorkbook } from "@/server/services/inventory-import";
import { slugify } from "@/lib/format";

/** The shop's inventory as .xlsx — also the template for bulk upload. */
export const GET = api({ roles: ["SHOP_OWNER"], rateLimit: { name: "inventory-export", limit: 20 } }, async ({ user }) => {
  const { shop } = await activeShopFor(user);
  const buf = await inventoryWorkbook(shop.id);
  const name = `${slugify(shop.name) || "shop"}-inventory-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
});
