import "server-only";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { format } from "date-fns";
import { db } from "@/server/db";
import { badRequest } from "@/server/errors";
import { STATUS_META, type OrderStatusKey } from "@/lib/order-status";
import type { OrderStatus } from "@/generated/prisma/client";

export const REPORT_TYPES = ["daily-sales", "monthly-sales", "shop-sales", "product-sales", "commission", "orders", "delivery", "customers"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];
export type ReportFormat = "csv" | "xlsx" | "pdf";

interface Table {
  title: string;
  columns: { key: string; label: string; money?: boolean }[];
  rows: Record<string, string | number | null>[];
}

const SALE_EXCLUDED: OrderStatus[] = ["CANCELLED", "SHOP_REJECTED", "PAYMENT_PENDING", "CREATED", "REFUNDED", "REFUND_PENDING"];
const rupees = (p: number) => Math.round(p) / 100;

export async function buildReport(type: ReportType, from: Date, to: Date, shopId?: string): Promise<Table> {
  const range = { gte: from, lte: to };
  const shopFilter = shopId ? { shopId } : {};
  switch (type) {
    case "daily-sales":
    case "monthly-sales": {
      const orders = await db.order.findMany({
        where: { createdAt: range, status: { notIn: SALE_EXCLUDED }, ...shopFilter },
        select: { createdAt: true, total: true, subtotal: true, couponDiscount: true, deliveryFee: true, taxAmount: true, commissionAmount: true },
      });
      const fmt = type === "daily-sales" ? "yyyy-MM-dd" : "yyyy-MM";
      const map = new Map<string, Record<string, number>>();
      for (const o of orders) {
        const k = format(o.createdAt, fmt);
        const v = map.get(k) ?? { orders: 0, gross: 0, discounts: 0, delivery: 0, tax: 0, total: 0, commission: 0 };
        v.orders++;
        v.gross += o.subtotal;
        v.discounts += o.couponDiscount;
        v.delivery += o.deliveryFee;
        v.tax += o.taxAmount;
        v.total += o.total;
        v.commission += o.commissionAmount;
        map.set(k, v);
      }
      return {
        title: type === "daily-sales" ? "Daily sales" : "Monthly sales",
        columns: [
          { key: "period", label: type === "daily-sales" ? "Date" : "Month" },
          { key: "orders", label: "Orders" },
          { key: "gross", label: "Item sales (₹)", money: true },
          { key: "discounts", label: "Coupon discounts (₹)", money: true },
          { key: "delivery", label: "Delivery fees (₹)", money: true },
          { key: "tax", label: "Tax (₹)", money: true },
          { key: "total", label: "Order value (₹)", money: true },
          { key: "commission", label: "Commission (₹)", money: true },
        ],
        rows: [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, v]) => ({ period, ...v })),
      };
    }
    case "shop-sales": {
      const grouped = await db.order.groupBy({
        by: ["shopId"],
        where: { createdAt: range, status: { notIn: SALE_EXCLUDED }, ...shopFilter },
        _count: true,
        _sum: { total: true, subtotal: true, commissionAmount: true, shopEarning: true },
      });
      const shops = await db.shop.findMany({ where: { id: { in: grouped.map((g) => g.shopId) } }, select: { id: true, name: true } });
      const name = new Map(shops.map((s) => [s.id, s.name]));
      return {
        title: "Shop-wise sales",
        columns: [
          { key: "shop", label: "Shop" },
          { key: "orders", label: "Orders" },
          { key: "gross", label: "Item sales (₹)", money: true },
          { key: "total", label: "Order value (₹)", money: true },
          { key: "commission", label: "Commission (₹)", money: true },
          { key: "earning", label: "Shop earning (₹)", money: true },
        ],
        rows: grouped
          .map((g) => ({
            shop: name.get(g.shopId) ?? g.shopId,
            orders: g._count,
            gross: g._sum.subtotal ?? 0,
            total: g._sum.total ?? 0,
            commission: g._sum.commissionAmount ?? 0,
            earning: g._sum.shopEarning ?? 0,
          }))
          .sort((a, b) => b.total - a.total),
      };
    }
    case "product-sales": {
      const grouped = await db.orderItem.groupBy({
        by: ["productId", "productName"],
        where: { order: { createdAt: range, status: { notIn: SALE_EXCLUDED }, ...shopFilter } },
        _sum: { quantity: true, lineTotal: true },
        _count: true,
        orderBy: { _sum: { lineTotal: "desc" } },
      });
      return {
        title: "Product-wise sales",
        columns: [
          { key: "product", label: "Product" },
          { key: "orders", label: "Orders" },
          { key: "units", label: "Units sold" },
          { key: "revenue", label: "Revenue (₹)", money: true },
        ],
        rows: grouped.map((g) => ({ product: g.productName, orders: g._count, units: g._sum.quantity ?? 0, revenue: g._sum.lineTotal ?? 0 })),
      };
    }
    case "commission": {
      const rows = await db.commission.findMany({
        where: { createdAt: range, ...shopFilter },
        include: { order: { select: { orderNumber: true } }, shop: { select: { name: true } }, settlement: { select: { status: true } } },
        orderBy: { createdAt: "asc" },
      });
      return {
        title: "Commission report",
        columns: [
          { key: "date", label: "Date" },
          { key: "order", label: "Order" },
          { key: "shop", label: "Shop" },
          { key: "base", label: "Base (₹)", money: true },
          { key: "rate", label: "Rate %" },
          { key: "commission", label: "Commission (₹)", money: true },
          { key: "earning", label: "Shop earning (₹)", money: true },
          { key: "settlement", label: "Settlement" },
        ],
        rows: rows.map((c) => ({
          date: format(c.createdAt, "yyyy-MM-dd"),
          order: c.order.orderNumber,
          shop: c.shop.name,
          base: c.baseAmount,
          rate: c.rateBps / 100,
          commission: c.amount,
          earning: c.shopEarning,
          settlement: c.settlement?.status ?? "UNSETTLED",
        })),
      };
    }
    case "orders": {
      const rows = await db.order.findMany({
        where: { createdAt: range, ...shopFilter },
        include: { shop: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
        take: 20000,
      });
      return {
        title: "Orders report",
        columns: [
          { key: "date", label: "Placed at" },
          { key: "order", label: "Order" },
          { key: "shop", label: "Shop" },
          { key: "customer", label: "Customer" },
          { key: "status", label: "Status" },
          { key: "payment", label: "Payment" },
          { key: "total", label: "Total (₹)", money: true },
        ],
        rows: rows.map((o) => ({
          date: format(o.createdAt, "yyyy-MM-dd HH:mm"),
          order: o.orderNumber,
          shop: o.shop.name,
          customer: o.contactName,
          status: STATUS_META[o.status as OrderStatusKey].label,
          payment: `${o.paymentMethod} / ${o.paymentStatus}`,
          total: o.total,
        })),
      };
    }
    case "delivery": {
      const rows = await db.shipment.findMany({
        where: { createdAt: range, ...(shopId ? { order: { shopId } } : {}) },
        include: { order: { select: { orderNumber: true, deliveredAt: true, packedAt: true, shop: { select: { name: true } } } } },
        orderBy: { createdAt: "asc" },
      });
      return {
        title: "Delivery report",
        columns: [
          { key: "order", label: "Order" },
          { key: "shop", label: "Shop" },
          { key: "awb", label: "AWB" },
          { key: "courier", label: "Courier" },
          { key: "status", label: "Status" },
          { key: "attempts", label: "Creation attempts" },
          { key: "failed", label: "Failed deliveries" },
          { key: "minutes", label: "Packed → delivered (min)" },
          { key: "freight", label: "Freight (₹)", money: true },
        ],
        rows: rows.map((s) => ({
          order: s.order.orderNumber,
          shop: s.order.shop.name,
          awb: s.awbCode,
          courier: s.courierName,
          status: s.status,
          attempts: s.attempts,
          failed: s.failedDeliveryCount,
          minutes: s.order.deliveredAt && s.order.packedAt ? Math.round((s.order.deliveredAt.getTime() - s.order.packedAt.getTime()) / 60000) : null,
          freight: s.freightCharge ?? 0,
        })),
      };
    }
    case "customers": {
      const customers = await db.customer.findMany({
        where: { createdAt: { lte: to } },
        include: { user: true, orders: { where: { status: { notIn: SALE_EXCLUDED } }, select: { total: true, createdAt: true } } },
        take: 20000,
      });
      return {
        title: "Customer report",
        columns: [
          { key: "name", label: "Name" },
          { key: "phone", label: "Phone" },
          { key: "email", label: "Email" },
          { key: "joined", label: "Joined" },
          { key: "orders", label: "Orders" },
          { key: "spend", label: "Lifetime spend (₹)", money: true },
          { key: "last", label: "Last order" },
          { key: "status", label: "Status" },
        ],
        rows: customers.map((c) => ({
          name: c.user.name ?? "",
          phone: c.user.phone ?? "",
          email: c.user.email ?? "",
          joined: format(c.createdAt, "yyyy-MM-dd"),
          orders: c.orders.length,
          spend: c.orders.reduce((s, o) => s + o.total, 0),
          last: c.orders.length ? format(c.orders.reduce((m, o) => (o.createdAt > m ? o.createdAt : m), c.orders[0].createdAt), "yyyy-MM-dd") : "",
          status: c.user.status,
        })),
      };
    }
    default:
      throw badRequest("Unknown report type");
  }
}

function cellValue(t: Table, row: Record<string, string | number | null>, key: string) {
  const col = t.columns.find((c) => c.key === key)!;
  const v = row[key];
  if (col.money && typeof v === "number") return rupees(v);
  return v ?? "";
}

export function toCsv(t: Table) {
  const esc = (v: unknown) => {
    let s = String(v ?? "");
    // Neutralise spreadsheet formula injection.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [t.columns.map((c) => esc(c.label)).join(",")];
  for (const r of t.rows) lines.push(t.columns.map((c) => esc(cellValue(t, r, c.key))).join(","));
  return "﻿" + lines.join("\n");
}

export async function toXlsx(t: Table, subtitle: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Dukaan Express";
  const ws = wb.addWorksheet(t.title.slice(0, 30));
  ws.addRow([t.title]).font = { bold: true, size: 14 };
  ws.addRow([subtitle]).font = { italic: true, color: { argb: "FF666666" } };
  ws.addRow([]);
  const header = ws.addRow(t.columns.map((c) => c.label));
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF15803D" } }));
  for (const r of t.rows) ws.addRow(t.columns.map((c) => cellValue(t, r, c.key)));
  t.columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.min(40, Math.max(12, c.label.length + 4));
    if (c.money) col.numFmt = "#,##0.00";
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function toPdf(t: Table, subtitle: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [842, 595]; // A4 landscape
  const margin = 32;
  const colW = (pageSize[0] - margin * 2) / t.columns.length;
  // StandardFonts are WinAnsi — strip characters they cannot encode (e.g. ₹).
  const safe = (s: string) => s.replace(/₹/g, "Rs").replace(/[^\x20-\x7E]/g, "");
  const clip = (s: string, w: number, f = font, size = 8) => {
    let out = safe(s);
    while (out.length > 1 && f.widthOfTextAtSize(out, size) > w - 4) out = out.slice(0, -2) + "…".replace("…", ".");
    return out;
  };
  let page = pdf.addPage(pageSize);
  let y = pageSize[1] - margin;
  const header = () => {
    page.drawRectangle({ x: margin, y: y - 14, width: pageSize[0] - margin * 2, height: 16, color: rgb(0.08, 0.5, 0.24) });
    t.columns.forEach((c, i) => page.drawText(clip(c.label, colW, bold), { x: margin + i * colW + 3, y: y - 10, size: 8, font: bold, color: rgb(1, 1, 1) }));
    y -= 20;
  };
  page.drawText(safe(t.title), { x: margin, y, size: 16, font: bold });
  y -= 16;
  page.drawText(safe(subtitle), { x: margin, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
  y -= 20;
  header();
  for (const [idx, r] of t.rows.entries()) {
    if (y < margin + 14) {
      page = pdf.addPage(pageSize);
      y = pageSize[1] - margin;
      header();
    }
    if (idx % 2 === 0) page.drawRectangle({ x: margin, y: y - 4, width: pageSize[0] - margin * 2, height: 13, color: rgb(0.95, 0.97, 0.95) });
    t.columns.forEach((c, i) => {
      const v = cellValue(t, r, c.key);
      const text = typeof v === "number" && c.money ? v.toFixed(2) : String(v);
      page.drawText(clip(text, colW), { x: margin + i * colW + 3, y, size: 8, font });
    });
    y -= 13;
  }
  if (!t.rows.length) page.drawText("No data for the selected period.", { x: margin, y, size: 10, font });
  return Buffer.from(await pdf.save());
}
