import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { api } from "@/server/http";
import { db } from "@/server/db";
import { forbidden, notFound } from "@/server/errors";

/** SANDBOX shipping label (only for MOCK- shipments). Real labels come from Shiprocket's label_url. */
export const GET = api({ roles: ["SUPER_ADMIN", "SHOP_OWNER"] }, async ({ user, params }) => {
  const s = await db.shipment.findFirst({
    where: { shiprocketShipmentId: params.id },
    include: { order: { include: { shop: { include: { address: true } }, items: true } } },
  });
  if (!s || !params.id.startsWith("MOCK-")) throw notFound("Label");
  if (user.role === "SHOP_OWNER" && s.order.shop.ownerId !== user.shopOwnerId) throw forbidden();
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([288, 432]); // 4x6 inch
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const a = s.order.addressSnapshot as Record<string, string | null>;
  let y = 410;
  const line = (t: string, size = 9, f = font) => {
    page.drawText(t.replace(/[^\x20-\x7E]/g, ""), { x: 14, y, size, font: f });
    y -= size + 5;
  };
  page.drawRectangle({ x: 8, y: 8, width: 272, height: 416, borderColor: rgb(0, 0, 0), borderWidth: 1 });
  line("SANDBOX LABEL - NOT A REAL SHIPMENT", 9, bold);
  line(`AWB: ${s.awbCode ?? "-"}`, 14, bold);
  line(`Courier: ${s.courierName ?? "-"}`);
  line(`Order: ${s.order.orderNumber}   ${s.order.paymentMethod === "COD" ? "COD Rs " + (s.order.total / 100).toFixed(2) : "PREPAID"}`);
  y -= 6;
  line("DELIVER TO", 9, bold);
  line(`${a.name ?? ""} (${a.phone ?? ""})`);
  line(`${a.line1 ?? ""}`);
  if (a.line2) line(a.line2);
  line(`${a.city ?? ""}, ${a.state ?? ""} - ${a.pincode ?? ""}`);
  y -= 6;
  line("PICKUP FROM", 9, bold);
  line(s.order.shop.name);
  line(`${s.order.shop.address?.line1 ?? ""}`);
  line(`${s.order.shop.address?.city ?? ""} - ${s.order.shop.address?.pincode ?? ""}`);
  y -= 6;
  line("ITEMS", 9, bold);
  for (const it of s.order.items.slice(0, 10)) line(`${it.quantity} x ${it.productName}`.slice(0, 50), 8);
  return new Response(new Uint8Array(await pdf.save()), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="label-${s.awbCode}.pdf"` },
  });
});
