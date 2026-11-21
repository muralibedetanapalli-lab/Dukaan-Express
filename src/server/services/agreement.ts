import "server-only";
import { randomBytes } from "node:crypto";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { db } from "@/server/db";
import { env, integrationModes } from "@/server/env";
import { badRequest, conflict, forbidden, notFound } from "@/server/errors";
import { sha256 } from "@/server/auth/password";
import type { SessionUser } from "@/server/auth/session";
import { escapeHtml, sendEmail } from "@/server/integrations/email";
import type { Prisma } from "@/generated/prisma/client";
import { bpsToPercent, formatINR } from "@/lib/money";
import { DELIVERY_MODE_LABEL } from "@/lib/order-status";
import { getSettings } from "./settings";
import { audit } from "./audit";
import { consumeEmailCode, issueEmailCode, normaliseEmail } from "./auth";
import { notifyAdmins, notifyShop, notifyUsers } from "./notification";
import { releaseWelcome } from "./welcome";

/**
 * Seller agreements.
 * Every onboarded shop gets an agreement built from its own details (commission, delivery mode, payouts…),
 * frozen as a snapshot and emailed to the owner with a PDF copy and a private signing link.
 * The owner opens the link, asks for a code sent to the same email, enters it and signs. That marks the shop's
 * agreement as accepted and the shop goes live. Until then the shop stays inactive and the shop panel waits.
 * Resending voids the previous link.
 */

export type AgreementTerms = {
  version: 1;
  number: string;
  issuedOn: string; // ISO
  platform: {
    brand: string;
    entity: string;
    address: string;
    gstin: string;
    supportEmail: string;
    supportPhone: string;
    jurisdiction: string;
  };
  shop: {
    name: string;
    address: string;
    gstin: string | null;
    phone: string;
    email: string | null;
    category: string | null;
  };
  owner: { name: string; email: string; phone: string | null };
  dealer: string | null;
  commercial: {
    commission: string;
    deliveryMode: string;
    deliveryFee: string;
    acceptMinutes: number;
    payoutDays: number;
  };
  sections: { title: string; items: string[] }[];
};

const actorOf = (u: SessionUser) => ({ id: u.id, role: u.role });
const hashToken = (t: string) => sha256(`agreement:${t}`);
const appUrl = () => env().APP_URL.replace(/\/$/, "");
const fmtDay = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
const fmtWhen = (d: Date | string) =>
  new Date(d).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }) + " IST";
/** Show the signing link in the API response only when email isn't configured outside production (local testing). */
const exposeLink = () => integrationModes().email !== "live" && process.env.NODE_ENV !== "production";

function agreementNumber() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  return `AGR-${new Date().getFullYear()}-${[...bytes].map((b) => alphabet[b % alphabet.length]).join("")}`;
}

async function buildTerms(shopId: string, number: string): Promise<AgreementTerms> {
  const shop = await db.shop.findUnique({
    where: { id: shopId },
    include: {
      address: true,
      category: true,
      owner: { include: { user: true } },
      dealer: { include: { user: { select: { name: true } } } },
    },
  });
  if (!shop || shop.deletedAt) throw notFound("Shop");
  const owner = shop.owner?.user;
  if (!owner?.email) throw badRequest("Assign a shop owner with an email address before sending the agreement");
  const s = await getSettings();
  const brand = s.platform.name || "Dukaan Express";
  const entity = s.legal.businessName.trim() || brand;
  const a = shop.address;
  const commission = bpsToPercent(shop.commissionBps ?? s.commission.defaultBps);
  const selfBooked = shop.deliveryMode === "SELF_BOOKED";
  const shopDelivers = shop.deliveryMode !== "RIDER";
  const deliveryFee = selfBooked
    ? "No delivery fee is charged to customers. The shop books and pays for delivery itself (e.g. Rapido, Ola)."
    : `Customers pay the delivery fee set by the Platform (currently ${formatINR(s.delivery.baseFee)} base + ${formatINR(s.delivery.perKmFee)} per km${s.delivery.freeDeliveryThreshold > 0 ? `, free above ${formatINR(s.delivery.freeDeliveryThreshold)}` : ""}). It belongs to the Platform.`;

  return {
    version: 1,
    number,
    issuedOn: new Date().toISOString(),
    platform: {
      brand,
      entity,
      address: s.legal.registeredAddress.trim(),
      gstin: s.legal.gstin.trim(),
      supportEmail: s.platform.supportEmail,
      supportPhone: s.platform.supportPhone,
      jurisdiction: s.legal.jurisdictionCity.trim() || "Bengaluru",
    },
    shop: {
      name: shop.name,
      address: a ? [a.line1, a.line2, a.landmark, `${a.city}, ${a.state} ${a.pincode}`].filter(Boolean).join(", ") : "",
      gstin: shop.gstNumber,
      phone: shop.contactPhone,
      email: shop.contactEmail,
      category: shop.category?.name ?? null,
    },
    owner: {
      name: owner.name ?? "Shop owner",
      email: owner.email,
      phone: owner.phone,
    },
    dealer: shop.dealer?.user.name ?? null,
    commercial: {
      commission,
      deliveryMode: DELIVERY_MODE_LABEL[shop.deliveryMode] ?? shop.deliveryMode,
      deliveryFee,
      acceptMinutes: s.order.shopAcceptTimeoutMinutes,
      payoutDays: 3,
    },
    sections: [
      {
        title: "1. Parties and purpose",
        items: [
          `This agreement is between ${entity} ("the Platform"), which operates ${brand}, and ${owner.name ?? "the shop owner"} for the shop "${shop.name}" ("the Seller").`,
          `The Seller lists and sells their goods to customers through ${brand}. The Seller is the seller of record of those goods; the Platform provides the marketplace, payments${shopDelivers ? "" : " and delivery"}.`,
          ...(shop.dealer
            ? [`The shop was onboarded by ${shop.dealer.user.name ?? "a regional dealer"}, the Platform's regional partner, who supports the Seller locally.`]
            : []),
        ],
      },
      {
        title: "2. Seller obligations",
        items: [
          "Give accurate business, contact, address and GST details and keep them up to date.",
          "Hold and keep valid every licence the business needs (for example GST, FSSAI for food, drug licence for medicines) and show them on request.",
          "List only genuine, safe, unexpired products with correct quantity, MRP and images. Never charge above the MRP. Do not list prohibited or counterfeit goods.",
          "Keep stock, prices and opening hours up to date in the Dukaan Partner app.",
          "Use customer details only to fulfil that order. Never use them for marketing or share them with anyone.",
        ],
      },
      {
        title: "3. Orders and delivery",
        items: [
          `Accept or reject each new order within ${s.order.shopAcceptTimeoutMinutes} minutes, otherwise it is rejected automatically. Frequent rejections may lead to the shop being paused.`,
          "Prepare and pack orders promptly with the correct items. If an item is unavailable, propose a modification in the app instead of substituting without consent.",
          `Delivery mode: ${DELIVERY_MODE_LABEL[shop.deliveryMode] ?? shop.deliveryMode}. ${
            shop.deliveryMode === "RIDER"
              ? "Platform riders pick up orders from the shop."
              : selfBooked
                ? "The Seller books a delivery service (e.g. Rapido, Ola) for every order, pays for it and updates the order status in the app."
                : "The Seller delivers orders with their own staff and updates the order status in the app."
          }`,
          deliveryFee,
        ],
      },
      {
        title: "4. Commission and earnings",
        items: [
          `For each delivered order the Platform keeps a commission of ${commission} of the item value after coupons. The rest is the Seller's earning.`,
          ...(shopDelivers && s.payments.codEnabled
            ? ["Cash collected by the Seller on cash-on-delivery orders is adjusted against the Seller's earnings."]
            : []),
          "Earnings from cancelled, rejected or fully refunded orders are not payable. A refund after delivery caused by the Seller may be recovered from future earnings.",
          "The Platform may change the commission rate with 15 days' notice in the shop panel.",
        ],
      },
      {
        title: "5. Payouts",
        items: [
          "The Seller adds a bank account in their own or their business's name. It is stored encrypted.",
          "The Seller can request a payout of the available balance at any time. Approved payouts are transferred within 3 working days by IMPS, NEFT, RTGS or UPI, with the reference (UTR) recorded.",
          "Payouts may be held if bank details do not match, fraud is suspected, or customer complaints are unresolved; the reason is shared.",
          "The Seller is responsible for their own income tax and GST filings. TCS/TDS is collected or deducted where the law requires.",
        ],
      },
      {
        title: "6. Suspension and termination",
        items: [
          "The Platform may pause or remove the shop for breach of this agreement, poor service, customer safety concerns or legal requirements.",
          "The Seller may stop selling at any time by telling the Platform. Earnings for delivered orders remain payable, less amounts owed to customers or the Platform.",
        ],
      },
      {
        title: "7. General",
        items: [
          `This agreement is in addition to the ${brand} Terms of Use and Seller Terms published at ${appUrl()}/legal, which the Seller also accepts.`,
          `It is signed electronically: the Seller confirms with a one-time code sent to ${owner.email}. The date, time and IP address of signing are recorded.`,
          `It is governed by Indian law, and the courts at ${s.legal.jurisdictionCity.trim() || "Bengaluru"} have jurisdiction.`,
          `Seller support: ${s.platform.supportEmail}, ${s.platform.supportPhone}.`,
        ],
      },
    ],
  };
}

// ───────────────────────────── PDF ─────────────────────────────

type Signed = {
  acceptedAt: Date;
  acceptedName: string | null;
  acceptedIp: string | null;
} | null;

export async function agreementPdf(terms: AgreementTerms, signed: Signed) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${terms.platform.brand} seller agreement ${terms.number}`);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595;
  const H = 842;
  const M = 50;
  const green = rgb(0.02, 0.37, 0.27);
  const grey = rgb(0.38, 0.38, 0.38);
  // StandardFonts are WinAnsi: replace what they cannot encode.
  const safe = (s: string) =>
    s
      .replace(/₹/g, "Rs ")
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, "-")
      .replace(/…/g, "...")
      .replace(/[^\x20-\x7E]/g, "");
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;
  const ensure = (h: number) => {
    if (y - h < M) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
  };
  const wrap = (text: string, f: PDFFont, size: number, width: number) => {
    const out: string[] = [];
    let line = "";
    for (const word of safe(text).split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (f.widthOfTextAtSize(next, size) > width && line) {
        out.push(line);
        line = word;
      } else line = next;
    }
    if (line) out.push(line);
    return out;
  };
  const para = (
    text: string,
    o: {
      f?: PDFFont;
      size?: number;
      color?: ReturnType<typeof rgb>;
      indent?: number;
      gap?: number;
    } = {},
  ) => {
    const f = o.f ?? font;
    const size = o.size ?? 10;
    const indent = o.indent ?? 0;
    for (const l of wrap(text, f, size, W - M * 2 - indent)) {
      ensure(size + 4);
      page.drawText(l, {
        x: M + indent,
        y: y - size,
        size,
        font: f,
        color: o.color ?? rgb(0.1, 0.1, 0.1),
      });
      y -= size + 4;
    }
    y -= o.gap ?? 4;
  };
  const row = (label: string, value: string) => {
    const lines = wrap(value || "-", font, 10, W - M * 2 - 130);
    ensure(lines.length * 14);
    page.drawText(safe(label), {
      x: M,
      y: y - 10,
      size: 10,
      font: bold,
      color: grey,
    });
    lines.forEach((l, i) => page.drawText(l, { x: M + 130, y: y - 10 - i * 14, size: 10, font }));
    y -= lines.length * 14 + 2;
  };

  page.drawText(safe(terms.platform.brand), {
    x: M,
    y: y - 16,
    size: 16,
    font: bold,
    color: green,
  });
  page.drawText(safe(terms.number), {
    x: W - M - bold.widthOfTextAtSize(safe(terms.number), 10),
    y: y - 14,
    size: 10,
    font: bold,
    color: grey,
  });
  y -= 30;
  para("Seller Agreement", { f: bold, size: 20, gap: 2 });
  para(`Issued on ${fmtDay(terms.issuedOn)}`, { color: grey, gap: 14 });

  para("Platform", { f: bold, size: 12 });
  row("Name", terms.platform.entity);
  if (terms.platform.address) row("Address", terms.platform.address);
  if (terms.platform.gstin) row("GSTIN", terms.platform.gstin);
  y -= 8;
  para("Seller", { f: bold, size: 12 });
  row("Shop", terms.shop.name);
  row("Address", terms.shop.address);
  if (terms.shop.gstin) row("GSTIN", terms.shop.gstin);
  row("Owner", terms.owner.name);
  row("Email", terms.owner.email);
  if (terms.owner.phone) row("Mobile", terms.owner.phone);
  if (terms.dealer) row("Onboarded by", terms.dealer);
  y -= 8;
  para("Key terms", { f: bold, size: 12 });
  row("Commission", `${terms.commercial.commission} of item value per delivered order`);
  row("Delivery", terms.commercial.deliveryMode);
  row("Order acceptance", `Within ${terms.commercial.acceptMinutes} minutes`);
  row("Payouts", `On request, within ${terms.commercial.payoutDays} working days`);
  y -= 12;

  for (const sec of terms.sections) {
    ensure(40);
    para(sec.title, { f: bold, size: 12, gap: 2 });
    for (const item of sec.items) {
      ensure(14);
      page.drawText("-", { x: M + 4, y: y - 10, size: 10, font });
      para(item, { indent: 16, gap: 2 });
    }
    y -= 8;
  }

  ensure(90);
  y -= 6;
  page.drawRectangle({
    x: M,
    y: y - 74,
    width: W - M * 2,
    height: 74,
    borderColor: signed ? green : grey,
    borderWidth: 1,
    color: signed ? rgb(0.93, 0.98, 0.95) : rgb(0.97, 0.97, 0.97),
  });
  y -= 14;
  if (signed) {
    para("Signed electronically", {
      f: bold,
      size: 12,
      color: green,
      indent: 12,
      gap: 0,
    });
    para(`By ${signed.acceptedName ?? terms.owner.name} on ${fmtWhen(signed.acceptedAt)}`, { indent: 12, gap: 0 });
    para(`Verified by a one-time code sent to ${terms.owner.email}${signed.acceptedIp ? ` - IP ${signed.acceptedIp}` : ""}`, {
      indent: 12,
      color: grey,
      size: 9,
    });
  } else {
    para("Not signed yet", { f: bold, size: 12, indent: 12, gap: 0 });
    para("Open the link in the email to read and sign this agreement. It is confirmed with a one-time code sent to your email.", {
      indent: 12,
      color: grey,
      size: 9,
    });
  }
  return Buffer.from(await pdf.save());
}

// ───────────────────────────── Emails ─────────────────────────────

function shell(brand: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#f4f6f5;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:28px">
<tr><td style="font-size:18px;font-weight:bold;color:#047857">${escapeHtml(brand)}</td></tr>
${body}
</table></td></tr></table></body></html>`;
}

function inviteEmail(t: AgreementTerms, link: string) {
  const brand = t.platform.brand;
  const rows = [
    ["Shop", t.shop.name],
    ["Commission", `${t.commercial.commission} per delivered order`],
    ["Delivery", t.commercial.deliveryMode],
    ["Agreement no.", t.number],
  ]
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 0;color:#666;font-size:14px;width:120px">${escapeHtml(k)}</td><td style="padding:4px 0;font-size:14px;font-weight:bold">${escapeHtml(v)}</td></tr>`,
    )
    .join("");
  const html = shell(
    brand,
    `<tr><td style="padding-top:16px;font-size:20px;font-weight:bold">Sign your seller agreement</td></tr>
<tr><td style="padding-top:8px;font-size:15px;line-height:1.5;color:#444">Hi ${escapeHtml(t.owner.name)}, welcome to ${escapeHtml(brand)}! Your shop <b>${escapeHtml(t.shop.name)}</b> has been set up. Read and sign the seller agreement to activate it. A copy is attached as a PDF.</td></tr>
<tr><td style="padding-top:14px"><table role="presentation" cellpadding="0" cellspacing="0" width="100%">${rows}</table></td></tr>
<tr><td style="padding:22px 0" align="center"><a href="${escapeHtml(link)}" style="display:inline-block;background:#047857;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 28px;border-radius:10px">Review &amp; sign agreement</a></td></tr>
<tr><td style="font-size:13px;color:#666;line-height:1.5">You'll confirm with a one-time code sent to this email. Once signed, your shop goes live and you can start taking orders in the Dukaan Partner app.<br><br>If the button doesn't work, open this link:<br><a href="${escapeHtml(link)}" style="color:#047857;word-break:break-all">${escapeHtml(link)}</a></td></tr>`,
  );
  const text = `Sign your ${brand} seller agreement\n\nHi ${t.owner.name}, your shop "${t.shop.name}" has been set up on ${brand}. Read and sign the seller agreement to activate it (copy attached).\n\nCommission: ${t.commercial.commission} per delivered order\nDelivery: ${t.commercial.deliveryMode}\nAgreement no.: ${t.number}\n\nReview and sign: ${link}\n\nYou'll confirm with a one-time code sent to this email.\n\n- ${brand}`;
  return {
    subject: `Action needed: sign your ${brand} seller agreement for ${t.shop.name}`,
    html,
    text,
  };
}

function signedEmail(t: AgreementTerms, when: Date) {
  const brand = t.platform.brand;
  const html = shell(
    brand,
    `<tr><td style="padding-top:16px;font-size:20px;font-weight:bold">Agreement signed. Your shop is live!</td></tr>
<tr><td style="padding-top:8px;font-size:15px;line-height:1.5;color:#444">Thanks ${escapeHtml(t.owner.name)}. You signed the seller agreement for <b>${escapeHtml(t.shop.name)}</b> on ${escapeHtml(fmtWhen(when))}. Your signed copy is attached.</td></tr>
<tr><td style="padding:22px 0" align="center"><a href="${escapeHtml(appUrl())}/login/staff?next=/shop" style="display:inline-block;background:#047857;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 28px;border-radius:10px">Open shop panel</a></td></tr>
<tr><td style="font-size:13px;color:#666;line-height:1.5">Next: add your products and your bank account for payouts. Agreement no. ${escapeHtml(t.number)}.</td></tr>`,
  );
  const text = `Agreement signed. Your shop is live!\n\nYou signed the ${brand} seller agreement for "${t.shop.name}" on ${fmtWhen(when)}. Your signed copy is attached.\n\nOpen the shop panel: ${appUrl()}/login/staff?next=/shop\n\n- ${brand}`;
  return {
    subject: `Signed: your ${brand} seller agreement (${t.number})`,
    html,
    text,
  };
}

const pdfName = (t: AgreementTerms, signed: boolean) =>
  `${t.platform.brand.replace(/[^A-Za-z0-9]+/g, "-")}-Seller-Agreement-${t.number}${signed ? "-signed" : ""}.pdf`;

// ───────────────────────────── Issue / resend ─────────────────────────────

/**
 * Builds a new agreement for the shop, voids earlier unsigned ones and emails the owner.
 * Never throws because of email delivery: `sent: false` tells the caller to offer a resend.
 */
export async function issueAgreement(actor: SessionUser | null, shopId: string) {
  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { agreementAcceptedAt: true, deletedAt: true },
  });
  if (!shop || shop.deletedAt) throw notFound("Shop");
  if (shop.agreementAcceptedAt) throw conflict("The owner has already signed the agreement for this shop");
  const number = agreementNumber();
  const terms = await buildTerms(shopId, number);
  const token = randomBytes(32).toString("base64url");
  await db.$transaction([
    db.shopAgreement.updateMany({
      where: { shopId, status: "PENDING" },
      data: { status: "VOID" },
    }),
    db.shopAgreement.create({
      data: {
        shopId,
        number,
        tokenHash: hashToken(token),
        sentTo: terms.owner.email,
        terms: terms as unknown as Prisma.InputJsonValue,
      },
    }),
  ]);
  const link = `${appUrl()}/agreement/${token}`;
  let sent = true;
  try {
    const pdf = await agreementPdf(terms, null);
    await sendEmail({
      to: terms.owner.email,
      ...inviteEmail(terms, link),
      attachments: [
        {
          filename: pdfName(terms, false),
          content: pdf,
          contentType: "application/pdf",
        },
      ],
    });
  } catch (err) {
    sent = false;
    console.error("[agreement] email failed", err instanceof Error ? err.message : err);
  }
  await audit(actor ? actorOf(actor) : { id: null, role: "SYSTEM" }, "agreement.issue", "Shop", shopId, { after: { number, sentTo: terms.owner.email, sent } });
  return {
    number,
    sentTo: terms.owner.email,
    sent,
    devLink: exposeLink() ? link : undefined,
  };
}

/** Admin, the shop's dealer or the owner asks for the agreement email again (new link, old one stops working). */
export async function resendAgreement(actor: SessionUser, shopId: string) {
  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { dealerId: true, ownerId: true, deletedAt: true },
  });
  if (!shop || shop.deletedAt) throw notFound("Shop");
  const allowed =
    actor.role === "SUPER_ADMIN" ||
    (actor.role === "DEALER" && actor.dealerId != null && shop.dealerId === actor.dealerId) ||
    (actor.role === "SHOP_OWNER" && actor.shopOwnerId != null && shop.ownerId === actor.shopOwnerId);
  if (!allowed) throw forbidden();
  const last = await db.shopAgreement.findFirst({
    where: { shopId },
    orderBy: { createdAt: "desc" },
    select: { sentAt: true },
  });
  if (last && Date.now() - last.sentAt.getTime() < 60_000) throw badRequest("The agreement was just sent. Please wait a minute before sending it again.");
  return issueAgreement(actor, shopId);
}

/** Issue an agreement only when the shop has an owner and hasn't signed one (used after onboarding / owner changes). */
export async function issueAgreementIfNeeded(actor: SessionUser | null, shopId: string) {
  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: {
      agreementAcceptedAt: true,
      owner: { select: { user: { select: { email: true } } } },
    },
  });
  if (!shop || shop.agreementAcceptedAt || !shop.owner?.user.email) return null;
  return issueAgreement(actor, shopId);
}

// ───────────────────────────── Owner: view, code, sign ─────────────────────────────

async function byToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw notFound("Agreement");
  const ag = await db.shopAgreement.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      shop: {
        select: { id: true, name: true, isActive: true, deletedAt: true },
      },
    },
  });
  if (!ag || ag.shop.deletedAt) throw notFound("Agreement");
  return ag;
}

const maskEmail = (e: string) => {
  const [u, d] = e.split("@");
  return `${u.slice(0, 2)}${"*".repeat(Math.max(1, u.length - 2))}@${d}`;
};

/** What the public agreement page shows. */
export async function agreementForToken(token: string) {
  const ag = await byToken(token);
  return {
    id: ag.id,
    status: ag.status,
    number: ag.number,
    terms: ag.terms as unknown as AgreementTerms,
    email: maskEmail(ag.sentTo),
    shopName: ag.shop.name,
    acceptedAt: ag.acceptedAt,
    acceptedName: ag.acceptedName,
  };
}

export async function sendAgreementCode(token: string) {
  const ag = await byToken(token);
  if (ag.status !== "PENDING")
    throw badRequest(
      ag.status === "ACCEPTED" ? "This agreement is already signed" : "This link has been replaced by a newer email. Please use the latest one.",
    );
  const r = await issueEmailCode(normaliseEmail(ag.sentTo), "AGREEMENT");
  return { ...r, email: maskEmail(ag.sentTo) };
}

export async function acceptAgreement(token: string, input: { name: string; code: string }, meta: { ip: string; userAgent: string | null }) {
  const ag = await byToken(token);
  if (ag.status === "ACCEPTED") throw badRequest("This agreement is already signed");
  if (ag.status !== "PENDING") throw badRequest("This link has been replaced by a newer email. Please use the latest one.");
  const email = normaliseEmail(ag.sentTo);
  await consumeEmailCode(email, "AGREEMENT", input.code);
  const now = new Date();
  const terms = ag.terms as unknown as AgreementTerms;

  const activated = await db.$transaction(async (tx) => {
    const done = await tx.shopAgreement.updateMany({
      where: { id: ag.id, status: "PENDING" },
      data: {
        status: "ACCEPTED",
        acceptedAt: now,
        acceptedName: input.name,
        acceptedIp: meta.ip,
        acceptedUserAgent: meta.userAgent?.slice(0, 300) ?? null,
      },
    });
    if (done.count !== 1) throw badRequest("This agreement is no longer open for signing");
    const shop = await tx.shop.findUniqueOrThrow({
      where: { id: ag.shopId },
      include: { address: true, owner: { select: { userId: true } } },
    });
    const canGoLive = shop.approvalStatus === "APPROVED" && !!shop.address && !!shop.ownerId;
    await tx.shop.update({
      where: { id: shop.id },
      data: {
        agreementAcceptedAt: now,
        ...(canGoLive ? { isActive: true } : {}),
      },
    });
    // The code proved the owner controls this email.
    if (shop.owner)
      await tx.user.updateMany({
        where: { id: shop.owner.userId, email, emailVerifiedAt: null },
        data: { emailVerifiedAt: now },
      });
    return { canGoLive, dealerId: shop.dealerId, ownerUserId: shop.owner?.userId ?? null };
  });

  await audit({ id: null, role: "SHOP_OWNER" }, "agreement.accept", "Shop", ag.shopId, {
    after: {
      number: ag.number,
      name: input.name,
      ip: meta.ip,
      activated: activated.canGoLive,
    },
  });
  await notifyAdmins({
    type: "SHOP",
    title: "Seller agreement signed",
    body: `${ag.shop.name} signed agreement ${ag.number}${activated.canGoLive ? " and is now live" : ""}`,
    link: `/admin/shops/${ag.shopId}`,
  });
  if (activated.dealerId) {
    const dealer = await db.dealer.findUnique({
      where: { id: activated.dealerId },
      select: { userId: true },
    });
    if (dealer)
      await notifyUsers([dealer.userId], {
        type: "SHOP",
        title: "Shop agreement signed",
        body: `${ag.shop.name} signed the agreement${activated.canGoLive ? " and is now live" : ""}`,
        link: `/dealer/shops/${ag.shopId}`,
      });
  }
  await notifyShop(ag.shopId, {
    type: "SHOP",
    title: "Agreement signed",
    body: activated.canGoLive ? "Your shop is live. Add products to start getting orders." : "Thanks! Your shop will go live once approved.",
    link: "/shop",
  });
  try {
    const pdf = await agreementPdf(terms, {
      acceptedAt: now,
      acceptedName: input.name,
      acceptedIp: meta.ip,
    });
    await sendEmail({
      to: email,
      ...signedEmail(terms, now),
      attachments: [
        {
          filename: pdfName(terms, true),
          content: pdf,
          contentType: "application/pdf",
        },
      ],
    });
  } catch (err) {
    console.error("[agreement] signed copy email failed", err instanceof Error ? err.message : err);
  }
  // The shop is live: the owner's account is ready, so send the welcome with their login details.
  if (activated.canGoLive && activated.ownerUserId) await releaseWelcome(activated.ownerUserId);
  return { signed: true, activated: activated.canGoLive };
}

// ───────────────────────────── Copies ─────────────────────────────

/** Latest agreement of a shop as a PDF, for the admin, the shop's dealer or its owner. */
export async function agreementPdfFor(actor: SessionUser, shopId: string) {
  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { dealerId: true, ownerId: true },
  });
  if (!shop) throw notFound("Shop");
  const allowed =
    actor.role === "SUPER_ADMIN" ||
    (actor.role === "DEALER" && actor.dealerId != null && shop.dealerId === actor.dealerId) ||
    (actor.role === "SHOP_OWNER" && actor.shopOwnerId != null && shop.ownerId === actor.shopOwnerId);
  if (!allowed) throw forbidden();
  const ag =
    (await db.shopAgreement.findFirst({
      where: { shopId, status: "ACCEPTED" },
      orderBy: { acceptedAt: "desc" },
    })) ??
    (await db.shopAgreement.findFirst({
      where: { shopId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    }));
  if (!ag) throw notFound("Agreement");
  const terms = ag.terms as unknown as AgreementTerms;
  const pdf = await agreementPdf(
    terms,
    ag.status === "ACCEPTED" && ag.acceptedAt
      ? {
          acceptedAt: ag.acceptedAt,
          acceptedName: ag.acceptedName,
          acceptedIp: ag.acceptedIp,
        }
      : null,
  );
  return { pdf, filename: pdfName(terms, ag.status === "ACCEPTED") };
}

/** Summary for admin / dealer / owner screens. */
export async function agreementSummary(shopId: string) {
  const ag = await db.shopAgreement.findFirst({
    where: { shopId, status: { in: ["PENDING", "ACCEPTED"] } },
    orderBy: { createdAt: "desc" },
  });
  if (!ag) return null;
  return {
    number: ag.number,
    status: ag.status,
    sentTo: ag.sentTo,
    sentAt: ag.sentAt,
    acceptedAt: ag.acceptedAt,
    acceptedName: ag.acceptedName,
    acceptedIp: ag.acceptedIp,
  };
}
