import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env, integrationModes } from "@/server/env";
import { upstream } from "@/server/errors";

/**
 * Outgoing email over SMTP (works with a Gmail app password, Brevo, Zoho, SES SMTP…).
 * Mock mode (no SMTP configured) logs the message on the server instead of sending it.
 */
let transporter: Transporter | null = null;
function transport() {
  if (transporter) return transporter;
  const e = env();
  transporter = nodemailer.createTransport({
    host: e.SMTP_HOST,
    port: e.SMTP_PORT,
    secure: e.SMTP_PORT === 465,
    auth: { user: e.SMTP_USER, pass: e.SMTP_PASS },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return transporter;
}

export async function sendEmail(msg: { to: string; subject: string; text: string; html?: string }): Promise<{ mock: boolean }> {
  if (integrationModes().email !== "live") {
    console.info(`[email:mock] to=${msg.to} subject="${msg.subject}"`);
    return { mock: true };
  }
  const e = env();
  try {
    await transport().sendMail({ from: e.EMAIL_FROM ?? e.SMTP_USER, ...msg });
    return { mock: false };
  } catch (err) {
    console.error("[email] send failed", err instanceof Error ? err.message : err);
    throw upstream("We couldn't send the email right now. Please try again in a minute.");
  }
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** A simple, mobile-friendly email with a big code. */
export function codeEmail(opts: { brand: string; heading: string; intro: string; code: string; minutes: number }) {
  const { brand, heading, intro, code, minutes } = opts;
  const text = `${heading}\n\n${intro}\n\nYour code: ${code}\n\nIt expires in ${minutes} minutes. If you didn't ask for this, you can ignore this email.\n\n— ${brand}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6f5;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border-radius:12px;padding:28px">
<tr><td style="font-size:18px;font-weight:bold;color:#047857">${escape(brand)}</td></tr>
<tr><td style="padding-top:16px;font-size:20px;font-weight:bold">${escape(heading)}</td></tr>
<tr><td style="padding-top:8px;font-size:15px;line-height:1.5;color:#444">${escape(intro)}</td></tr>
<tr><td style="padding:20px 0"><div style="font-size:32px;letter-spacing:8px;font-weight:bold;text-align:center;background:#ecfdf5;border-radius:10px;padding:14px 0;color:#065f46">${escape(code)}</div></td></tr>
<tr><td style="font-size:13px;color:#666;line-height:1.5">This code expires in ${minutes} minutes. If you didn't ask for it, you can safely ignore this email.</td></tr>
</table></td></tr></table></body></html>`;
  return { text, html };
}
