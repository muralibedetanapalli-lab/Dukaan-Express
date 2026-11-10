import { api } from "@/server/http";
import { activeShopFor } from "@/server/services/inventory";
import { salesSeries, shopDashboard } from "@/server/services/dashboard";

export const GET = api({ roles: ["SHOP_OWNER"] }, async ({ user }) => {
  const { shop } = await activeShopFor(user);
  const [stats, series] = await Promise.all([shopDashboard(shop.id), salesSeries("daily", shop.id)]);
  return { shop: { id: shop.id, name: shop.name }, stats, series: series.slice(-14) };
});
