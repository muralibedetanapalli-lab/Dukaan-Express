import "server-only";
import ExcelJS from "exceljs";
import { db } from "@/server/db";
import { badRequest } from "@/server/errors";
import type { SessionUser } from "@/server/auth/session";
import { audit } from "./audit";
import { notifyAdmins } from "./notification";
import { createInventory, updateInventory } from "./inventory";

/**
 * Bulk inventory by Excel: the shop downloads its inventory as a sheet (also the template for new items),
 * edits it, and uploads it back. Rows with an Item ID (or matching an existing product name + variant)
 * update that item; other rows add new products, which get an auto-generated icon until a photo is added.
 * Uploads are previewed first (dryRun) and nothing is saved until the shop confirms.
 */

const UNITS = ["pcs", "g", "kg", "ml", "l", "pack", "dozen"] as const;
type Unit = (typeof UNITS)[number];
const MAX_ROWS = 1000;

const COLUMNS = [
  { key: "id", header: "Item ID (don't edit)", width: 26 },
  { key: "name", header: "Product name *", width: 34 },
  { key: "category", header: "Category *", width: 22 },
  { key: "brand", header: "Brand", width: 16 },
  { key: "unit", header: "Unit *", width: 9 },
  { key: "unitValue", header: "Unit size", width: 10 },
  { key: "variant", header: "Variant", width: 12 },
  { key: "mrp", header: "MRP (₹) *", width: 11 },
  { key: "price", header: "Selling price (₹) *", width: 16 },
  { key: "stock", header: "Stock *", width: 9 },
  { key: "lowStock", header: "Low stock alert", width: 14 },
  { key: "maxPerOrder", header: "Max per order", width: 13 },
  { key: "available", header: "Available (Yes/No)", width: 17 },
  { key: "shopSku", header: "Shop SKU", width: 14 },
  { key: "barcode", header: "Barcode", width: 16 },
] as const;
type ColKey = (typeof COLUMNS)[number]["key"];

const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)|\*/g, "").replace(/[^a-z0-9]/g, "");
const HEADER_LOOKUP = new Map<string, ColKey>(COLUMNS.map((c) => [norm(c.header), c.key]));
// A few friendly aliases for sheets people build themselves.
for (const [alias, key] of [
  ["itemid", "id"],
  ["id", "id"],
  ["product", "name"],
  ["name", "name"],
  ["sellingprice", "price"],
  ["price", "price"],
  ["qty", "stock"],
  ["quantity", "stock"],
  ["available", "available"],
  ["sku", "shopSku"],
] as const)
  HEADER_LOOKUP.set(alias, key);

// ───────────────────────────── Template / export ─────────────────────────────

/** The shop's current inventory as an Excel file; doubles as the upload template. */
export async function inventoryWorkbook(shopId: string) {
  const [items, categories] = await Promise.all([
    db.shopInventory.findMany({
      where: { shopId, deletedAt: null },
      include: { product: { include: { category: true } }, variant: true },
      orderBy: [{ product: { category: { name: "asc" } } }, { product: { name: "asc" } }],
    }),
    db.category.findMany({ where: { isActive: true, deletedAt: null }, orderBy: { name: "asc" }, select: { name: true } }),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Dukaan Express";
  const ws = wb.addWorksheet("Inventory", { views: [{ state: "frozen", ySplit: 1, xSplit: 2 }] });
  ws.columns = COLUMNS.map((c) => ({ key: c.key, header: c.header, width: c.width }));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF15803D" } };
  head.height = 22;
  head.alignment = { vertical: "middle" };

  for (const i of items) {
    ws.addRow({
      id: i.id,
      name: i.product.name,
      category: i.product.category.name,
      brand: i.product.brand ?? "",
      unit: i.product.unit,
      unitValue: i.product.unitValue ?? "",
      variant: i.variant?.name ?? "",
      mrp: i.mrp / 100,
      price: i.sellingPrice / 100,
      stock: i.stock,
      lowStock: i.lowStockThreshold,
      maxPerOrder: i.maxPerOrder,
      available: i.isAvailable ? "Yes" : "No",
      shopSku: i.shopSku ?? "",
      barcode: i.product.barcode ?? "",
    });
  }
  ws.getColumn("id").font = { color: { argb: "FF9CA3AF" } };
  ws.getColumn("mrp").numFmt = "0.00";
  ws.getColumn("price").numFmt = "0.00";

  // Lists for drop-downs (on a separate sheet so long category lists work in every Excel version).
  const lists = wb.addWorksheet("Lists");
  lists.getColumn(1).values = ["Categories", ...categories.map((c) => c.name)];
  lists.getColumn(2).values = ["Units", ...UNITS];
  lists.getColumn(3).values = ["Available", "Yes", "No"];
  lists.getRow(1).font = { bold: true };
  const last = Math.max(items.length + 200, 500);
  for (let r = 2; r <= last; r++) {
    ws.getCell(`C${r}`).dataValidation = { type: "list", allowBlank: true, formulae: [`Lists!$A$2:$A$${Math.max(2, categories.length + 1)}`] };
    ws.getCell(`E${r}`).dataValidation = { type: "list", allowBlank: true, formulae: [`Lists!$B$2:$B$${UNITS.length + 1}`] };
    ws.getCell(`M${r}`).dataValidation = { type: "list", allowBlank: true, formulae: ["Lists!$C$2:$C$3"] };
  }

  const help = wb.addWorksheet("How to use");
  help.getColumn(1).width = 110;
  [
    "How to update your inventory with this sheet",
    "",
    "• To change price or stock: edit the row and upload the file. Leave 'Item ID' as it is.",
    "• To add a new product: add a row at the bottom and leave 'Item ID' empty.",
    "• Columns marked * are required for new products. For existing items, blank cells keep their current value.",
    "• Prices are in rupees (e.g. 49 or 49.50). Selling price can't be more than MRP.",
    "• Unit is one of: pcs, g, kg, ml, l, pack, dozen. 'Unit size' is the amount, e.g. 500 for a 500 g pack.",
    "• Pick the Category from the drop-down. New products get a picture automatically; you can replace it with a photo later.",
    "• Deleting a row here does NOT remove the product from your shop. Set 'Available' to No to hide it instead.",
  ].forEach((t, i) => {
    const c = help.getCell(`A${i + 1}`);
    c.value = t;
    if (i === 0) c.font = { bold: true, size: 14 };
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ───────────────────────────── Parse ─────────────────────────────

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("").trim();
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("text" in v) return String(v.text).trim();
  }
  return String(v).trim();
}

type RawRow = { row: number } & Partial<Record<ColKey, string>>;

async function readRows(file: File): Promise<RawRow[]> {
  if (file.size > 5 * 1024 * 1024) throw badRequest("The file is too large (max 5 MB)");
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    throw badRequest("Couldn't read this file. Upload an Excel .xlsx file (use the downloaded template).");
  }
  const ws = wb.getWorksheet("Inventory") ?? wb.worksheets[0];
  if (!ws) throw badRequest("The file has no sheets");

  const map = new Map<number, ColKey>();
  ws.getRow(1).eachCell((cell, col) => {
    const key = HEADER_LOOKUP.get(norm(cellText(cell.value)));
    if (key && ![...map.values()].includes(key)) map.set(col, key);
  });
  const keys = [...map.values()];
  if (!keys.includes("name") && !keys.includes("id")) throw badRequest("Couldn't find a 'Product name' column in the first row. Use the downloaded template.");

  const rows: RawRow[] = [];
  ws.eachRow({ includeEmpty: false }, (r, n) => {
    if (n === 1) return;
    const row: RawRow = { row: n };
    let any = false;
    for (const [col, key] of map) {
      const t = cellText(r.getCell(col).value);
      if (t) {
        row[key] = t;
        any = true;
      }
    }
    if (any) rows.push(row);
  });
  if (rows.length > MAX_ROWS) throw badRequest(`Too many rows (${rows.length}). Upload at most ${MAX_ROWS} at a time.`);
  return rows;
}

// ───────────────────────────── Validate + apply ─────────────────────────────

export interface ImportRowResult {
  row: number;
  name: string;
  action: "create" | "update" | "unchanged" | "error";
  message?: string;
  changes?: string[];
  inventoryId?: string;
  imageUrl?: string | null;
}

const rupees = (s: string | undefined, label: string) => {
  if (s == null || s === "") return undefined;
  const n = Number(s.replace(/[₹,\s]/g, ""));
  if (!Number.isFinite(n) || n < 1 || n > 100_000) throw new Error(`${label} must be between ₹1 and ₹1,00,000`);
  return Math.round(n * 100);
};
const int = (s: string | undefined, label: string, min: number, max: number) => {
  if (s == null || s === "") return undefined;
  const n = Number(s.replace(/[,\s]/g, ""));
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${label} must be a whole number from ${min} to ${max}`);
  return n;
};
const yesNo = (s: string | undefined) => {
  if (s == null || s === "") return undefined;
  const v = s.toLowerCase();
  if (["yes", "y", "true", "1", "available"].includes(v)) return true;
  if (["no", "n", "false", "0", "unavailable"].includes(v)) return false;
  throw new Error("Available must be Yes or No");
};
const weightFor = (unit: Unit, value: number | null) =>
  value && (unit === "g" || unit === "ml") ? Math.max(1, Math.min(50000, Math.round(value))) : value && (unit === "kg" || unit === "l") ? Math.min(50000, Math.round(value * 1000)) : 500;
const keyOf = (name: string, variant: string) => `${name.trim().toLowerCase()}|${variant.trim().toLowerCase()}`;

export async function importInventory(shopId: string, actor: SessionUser, file: File, dryRun: boolean) {
  const rows = await readRows(file);
  if (!rows.length) throw badRequest("The sheet has no product rows");

  const [existing, categories] = await Promise.all([
    db.shopInventory.findMany({
      where: { shopId, deletedAt: null },
      include: { product: { include: { images: { orderBy: { sortOrder: "asc" }, take: 1 } } }, variant: true },
    }),
    db.category.findMany({ where: { isActive: true, deletedAt: null }, select: { id: true, name: true } }),
  ]);
  const byId = new Map(existing.map((i) => [i.id, i]));
  const byKey = new Map(existing.map((i) => [keyOf(i.product.name, i.variant?.name ?? ""), i]));
  const catByName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c]));
  const seen = new Set<string>();
  const results: ImportRowResult[] = [];
  let createdPending = 0;

  for (const r of rows) {
    const name = r.name ?? "";
    try {
      const mrp = rupees(r.mrp, "MRP");
      const price = rupees(r.price, "Selling price");
      const stock = int(r.stock, "Stock", 0, 100000);
      const lowStock = int(r.lowStock, "Low stock alert", 0, 10000);
      const maxPerOrder = int(r.maxPerOrder, "Max per order", 1, 100);
      const available = yesNo(r.available);
      const variant = (r.variant ?? "").slice(0, 40);
      const shopSku = r.shopSku?.slice(0, 60);

      const current = (r.id && byId.get(r.id)) || (name ? byKey.get(keyOf(name, variant)) : undefined);
      if (r.id && !byId.has(r.id) && !current) throw new Error("Item ID not found in your shop. Clear it to add this as a new product.");

      const dupKey = current ? `id:${current.id}` : keyOf(name, variant);
      if (seen.has(dupKey)) throw new Error("This product appears more than once in the sheet");
      seen.add(dupKey);

      if (current) {
        const nextMrp = mrp ?? current.mrp;
        const nextPrice = price ?? current.sellingPrice;
        if (nextPrice > nextMrp) throw new Error("Selling price can't be more than MRP");
        const changes: string[] = [];
        const patch: Parameters<typeof updateInventory>[3] = {};
        if (mrp != null && mrp !== current.mrp) (patch.mrp = mrp), changes.push(`MRP ₹${current.mrp / 100} → ₹${mrp / 100}`);
        if (price != null && price !== current.sellingPrice) (patch.sellingPrice = price), changes.push(`Price ₹${current.sellingPrice / 100} → ₹${price / 100}`);
        if (stock != null && stock !== current.stock) (patch.stock = stock), changes.push(`Stock ${current.stock} → ${stock}`);
        if (lowStock != null && lowStock !== current.lowStockThreshold) (patch.lowStockThreshold = lowStock), changes.push(`Low stock alert ${lowStock}`);
        if (maxPerOrder != null && maxPerOrder !== current.maxPerOrder) (patch.maxPerOrder = maxPerOrder), changes.push(`Max per order ${maxPerOrder}`);
        if (available != null && available !== current.isAvailable) (patch.isAvailable = available), changes.push(available ? "Made available" : "Hidden from customers");
        if (shopSku != null && shopSku !== (current.shopSku ?? "")) (patch.shopSku = shopSku), changes.push("Shop SKU");
        const base = { row: r.row, name: current.product.name + (current.variant ? ` · ${current.variant.name}` : ""), inventoryId: current.id, imageUrl: current.product.images[0]?.url ?? null };
        if (!changes.length) {
          results.push({ ...base, action: "unchanged" });
          continue;
        }
        if (!dryRun) await updateInventory(shopId, current.id, actor, patch);
        results.push({ ...base, action: "update", changes });
        continue;
      }

      // New product
      if (name.length < 2) throw new Error("Product name is required");
      if (name.length > 120) throw new Error("Product name is too long (max 120 characters)");
      const cat = r.category ? catByName.get(r.category.trim().toLowerCase()) : undefined;
      if (!cat) throw new Error(r.category ? `Unknown category "${r.category}". Pick one from the drop-down.` : "Category is required");
      const unit = (r.unit ?? "pcs").toLowerCase() as Unit;
      if (!UNITS.includes(unit)) throw new Error(`Unit must be one of: ${UNITS.join(", ")}`);
      const unitValue = r.unitValue ? Number(r.unitValue) : null;
      if (unitValue != null && (!Number.isFinite(unitValue) || unitValue <= 0 || unitValue > 100000)) throw new Error("Unit size must be a positive number");
      if (mrp == null) throw new Error("MRP is required");
      if (price == null) throw new Error("Selling price is required");
      if (price > mrp) throw new Error("Selling price can't be more than MRP");
      if (stock == null) throw new Error("Stock is required");

      // Reuse a matching catalogue product (same name and category) instead of creating a duplicate.
      const master = await db.product.findFirst({
        where: { name: { equals: name, mode: "insensitive" }, categoryId: cat.id, deletedAt: null, approvalStatus: { not: "REJECTED" } },
        select: { id: true, images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } } },
      });
      const message = master ? "Linked to the existing catalogue product" : undefined;
      if (dryRun) {
        results.push({ row: r.row, name: name + (variant ? ` · ${variant}` : ""), action: "create", message, imageUrl: master?.images[0]?.url ?? null });
        continue;
      }
      const inv = await createInventory(
        shopId,
        actor,
        {
          productId: master?.id ?? null,
          product: master
            ? null
            : {
                name,
                brand: r.brand?.slice(0, 60) || null,
                categoryId: cat.id,
                barcode: r.barcode?.slice(0, 60) || null,
                unit,
                unitValue,
                weightGrams: weightFor(unit, unitValue),
                lengthCm: 15,
                breadthCm: 10,
                heightCm: 8,
                images: [],
              },
          variantName: variant || null,
          shopSku: shopSku || null,
          mrp,
          sellingPrice: price,
          stock,
          lowStockThreshold: lowStock ?? 5,
          maxPerOrder: maxPerOrder ?? 10,
          isAvailable: available ?? true,
        },
        { notify: false },
      );
      const saved = await db.shopInventory.findUniqueOrThrow({
        where: { id: inv.id },
        select: { product: { select: { approvalStatus: true, images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } } } } },
      });
      if (saved.product.approvalStatus === "PENDING") createdPending++;
      results.push({ row: r.row, name: name + (variant ? ` · ${variant}` : ""), action: "create", message, inventoryId: inv.id, imageUrl: saved.product.images[0]?.url ?? null });
    } catch (e) {
      results.push({ row: r.row, name: name || "(no name)", action: "error", message: e instanceof Error ? e.message : "Couldn't read this row" });
    }
  }

  const summary = {
    create: results.filter((x) => x.action === "create").length,
    update: results.filter((x) => x.action === "update").length,
    unchanged: results.filter((x) => x.action === "unchanged").length,
    error: results.filter((x) => x.action === "error").length,
  };
  if (!dryRun) {
    await audit({ id: actor.id, role: actor.role }, "inventory.import", "Shop", shopId, { after: summary });
    if (createdPending) {
      await notifyAdmins({ type: "SHOP", title: `${createdPending} new products awaiting approval`, body: "Added by a shop's Excel upload", link: "/admin/products?approval=PENDING" });
    }
  }
  return { dryRun, summary, rows: results };
}
