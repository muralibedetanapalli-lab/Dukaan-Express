import "server-only";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { decryptField, encryptField } from "@/server/crypto";
import { escapeHtml, sendEmail } from "@/server/integrations/email";
import { getSettings } from "./settings";
import { audit, SYSTEM_ACTOR } from "./audit";

/**
 * Welcome email with login details for shop owners, dealers and riders, sent once their account is active:
 * - dealers and riders added by an admin or dealer: straight away (they can work immediately);
 * - riders who signed up themselves: when their documents are approved (no password: they chose it);
 * - shop owners: when they sign the seller agreement and their shop goes live. Until then the temporary
 *   password is held encrypted in `User.welcomeSecret` and erased as soon as the email is sent.
 * Sent at most once per user. Email failures are logged, never thrown, so they can't break onboarding.
 */

type Role = "SHOP_OWNER" | "DEALER" | "RIDER";

const COPY: Record<Role, { app: string; heading: (brand: string) => string; intro: string; next: string[] }> = {
  SHOP_OWNER: {
    app: "Dukaan Partner",
    heading: (b) => `Welcome to ${b}, your shop is live!`,
    intro: "Your seller account is active. Sign in to manage orders, products and payouts.",
    next: [
      "Add your products (one by one or from an Excel sheet)",
      "Add your bank account for payouts",
      "Keep “Accepting orders” switched on during shop hours",
    ],
  },
  DEALER: {
    app: "Dukaan Partner",
    heading: (b) => `Welcome to ${b}, you're now a dealer`,
    intro: "Your dealer account is active. Sign in to onboard shops in your area, manage riders and track your earnings.",
    next: [
      "Onboard your first shop. Its pincode becomes your area if you don't have one yet",
      "Add your bank account to receive your commission share",
      "Add riders for your area",
    ],
  },
  RIDER: {
    app: "Dukaan Rider",
    heading: (b) => `Welcome to ${b}, you're ready to deliver`,
    intro: "Your rider account is active. Sign in and go online to start getting delivery jobs.",
    next: ["Go online when you're ready to take orders", "Add your bank account or UPI for withdrawals", "Keep location on while you're delivering"],
  },
};

export function welcomeEmail(o: { brand: string; role: Role; name: string; email: string; phone: string | null; password: string | null; support: string }) {
  const c = COPY[o.role];
  const login = `${env().APP_URL.replace(/\/$/, "")}/login/staff`;
  const rows: [string, string][] = [
    ["Sign-in email", o.email],
    ...(o.phone ? ([["Mobile", o.phone]] as [string, string][]) : []),
    ["Password", o.password ?? "The password you chose when signing up"],
  ];
  const tr = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 0;color:#666;font-size:14px;width:120px">${escapeHtml(k)}</td><td style="padding:6px 0;font-size:15px;font-weight:bold;${k === "Password" && o.password ? "font-family:Consolas,Menlo,monospace;letter-spacing:1px" : ""}">${escapeHtml(v)}</td></tr>`,
    )
    .join("");
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6f5;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:28px">
<tr><td style="font-size:18px;font-weight:bold;color:#047857">${escapeHtml(o.brand)}</td></tr>
<tr><td style="padding-top:16px;font-size:20px;font-weight:bold">${escapeHtml(c.heading(o.brand))}</td></tr>
<tr><td style="padding-top:8px;font-size:15px;line-height:1.5;color:#444">Hi ${escapeHtml(o.name)},<br>${escapeHtml(c.intro)}</td></tr>
<tr><td style="padding-top:16px"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#ecfdf5;border-radius:10px;padding:12px 16px">${tr}</table></td></tr>
<tr><td style="padding:22px 0" align="center"><a href="${escapeHtml(login)}" style="display:inline-block;background:#047857;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 28px;border-radius:10px">Sign in</a></td></tr>
<tr><td style="font-size:14px;line-height:1.5;color:#444">Use the <b>${escapeHtml(c.app)}</b> app or sign in on the website. Next steps:<ul style="margin:8px 0 0;padding-left:20px">${c.next.map((n) => `<li style="margin:4px 0">${escapeHtml(n)}</li>`).join("")}</ul></td></tr>
<tr><td style="padding-top:16px;font-size:13px;color:#666;line-height:1.5">${
    o.password
      ? "For your security, change this password after you first sign in (use <b>Forgot password</b> on the sign-in page). Don't share it with anyone. "
      : ""
  }Need help? Contact ${escapeHtml(o.support)}.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    c.heading(o.brand),
    "",
    `Hi ${o.name},`,
    c.intro,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    `Sign in: ${login} (or use the ${c.app} app)`,
    "",
    "Next steps:",
    ...c.next.map((n) => `- ${n}`),
    "",
    ...(o.password ? ["For your security, change this password after you first sign in (use Forgot password on the sign-in page)."] : []),
    `Need help? Contact ${o.support}.`,
    "",
    `- ${o.brand}`,
  ].join("\n");
  return { subject: `Welcome to ${o.brand}: your login details`, html, text };
}

/** Send the welcome email now (once). `password` is the temporary password, or null when the user chose their own. */
export async function sendWelcome(userId: string, password: string | null) {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, name: true, email: true, phone: true, status: true, welcomeSentAt: true, deletedAt: true },
  });
  if (!u || u.welcomeSentAt || u.deletedAt || !u.email || !(u.role in COPY)) return { sent: false };
  // Claim it first so two activations at once can't send it twice.
  const claimed = await db.user.updateMany({ where: { id: userId, welcomeSentAt: null }, data: { welcomeSentAt: new Date() } });
  if (claimed.count !== 1) return { sent: false };
  const s = await getSettings();
  try {
    await sendEmail({
      to: u.email,
      ...welcomeEmail({
        brand: s.platform.name || "Dukaan Express",
        role: u.role as Role,
        name: u.name ?? "there",
        email: u.email,
        phone: u.phone,
        password,
        support: `${s.platform.supportEmail} / ${s.platform.supportPhone}`,
      }),
    });
  } catch (err) {
    // Not sent: keep the password (encrypted) so the next activation or a resend can still include it.
    await db.user.update({ where: { id: userId }, data: { welcomeSentAt: null, welcomeSecret: password ? encryptField(password) : undefined } });
    console.error("[welcome] email failed", err instanceof Error ? err.message : err);
    return { sent: false };
  }
  await db.user.update({ where: { id: userId }, data: { welcomeSecret: null } });
  await audit(SYSTEM_ACTOR, "user.welcome_email", "User", userId, { after: { role: u.role, withPassword: !!password } });
  return { sent: true };
}

/** Keep the temporary password (encrypted) until the account is activated, e.g. a shop owner whose agreement is unsigned. */
export async function holdWelcome(userId: string, password: string) {
  await db.user.updateMany({ where: { id: userId, welcomeSentAt: null }, data: { welcomeSecret: encryptField(password) } });
}

/** The account just became active: send the held welcome (with its password, if one was held). */
export async function releaseWelcome(userId: string) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { welcomeSentAt: true, welcomeSecret: true } });
  if (!u || u.welcomeSentAt) return { sent: false };
  let password: string | null = null;
  if (u.welcomeSecret) {
    try {
      password = decryptField(u.welcomeSecret);
    } catch {
      password = null;
    }
  }
  return sendWelcome(userId, password);
}

/** An admin reset the password before the welcome went out: the welcome should carry the new one. */
export async function updateHeldWelcome(userId: string, password: string) {
  await db.user.updateMany({ where: { id: userId, welcomeSentAt: null, welcomeSecret: { not: null } }, data: { welcomeSecret: encryptField(password) } });
}
