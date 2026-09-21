import nodemailer from "nodemailer";
import { getSiteUrl } from "@/lib/siteUrl";

// Free email sending via Gmail's SMTP — no paid email service needed.
// Requires a Gmail account with 2-Step Verification enabled and an
// "App Password" (Google Account -> Security -> App passwords), NOT the
// normal account password. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env.
let cachedTransporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;

  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });
  }
  return cachedTransporter;
}

export function isMailerConfigured(): boolean {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: MailAttachment[];
}

/**
 * Sends an email via Gmail SMTP. Never throws — logs and returns false on
 * failure so a flaky email step can never block a payment or form submit.
 */
export async function sendMail({ to, subject, html, replyTo, attachments }: SendMailInput): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn("Mailer not configured — skipping email send. Set GMAIL_USER and GMAIL_APP_PASSWORD.");
    return false;
  }
  try {
    await transporter.sendMail({
      from: `"Direct2hub" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html,
      replyTo,
      attachments,
    });
    return true;
  } catch (err) {
    console.error("Email send failed:", err);
    return false;
  }
}

const BRAND_COLOR = "#C1440E";

function emailShell(title: string, bodyHtml: string, logoUrl?: string): string {
  // Email clients load images over the open internet, not from this
  // server — a relative admin-uploaded path (e.g. "/uploads/logo.png")
  // has to be made absolute or the logo just shows as a broken image.
  const absoluteLogoUrl = logoUrl ? (logoUrl.startsWith("http") ? logoUrl : `${getSiteUrl()}${logoUrl}`) : undefined;
  const brandMark = absoluteLogoUrl
    ? `<img src="${escapeHtml(absoluteLogoUrl)}" alt="Direct2hub" width="36" height="36" style="border-radius:8px;display:block;margin-bottom:8px;background:#fff;" />`
    : "";
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#FBF6F1;font-family:Arial,Helvetica,sans-serif;color:#2B0F08;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(43,15,8,0.12);">
          <tr>
            <td style="background:linear-gradient(135deg,${BRAND_COLOR},#FF7A45);padding:28px 32px;">
              ${brandMark}
              <p style="margin:0;font-size:20px;font-weight:800;color:#fff;letter-spacing:-0.02em;">Direct2hub</p>
              <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.85);">${title}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px;background:#FBF6F1;text-align:center;">
              <p style="margin:0;font-size:12px;color:#7A2E15AA;">© ${new Date().getFullYear()} Direct2hub. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export function orderConfirmationEmail(params: {
  name: string;
  accessUrl: string;
  invoiceUrl: string;
  amountLabel: string;
  invoiceNumber: string;
  logoUrl?: string;
}): string {
  const { name, accessUrl, invoiceUrl, amountLabel, invoiceNumber, logoUrl } = params;
  return emailShell(
    "Payment confirmed 🎉",
    `<h1 style="margin:0 0 12px;font-size:22px;color:${BRAND_COLOR};">Thanks, ${escapeHtml(name)}!</h1>
     <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Your payment of <strong>${amountLabel}</strong> was successful and your copy of
     <strong>The Ecommerce Playbook</strong> is ready to download. Your invoice (<strong>${escapeHtml(
       invoiceNumber
     )}</strong>) is attached to this email as a PDF.</p>
     <p style="text-align:center;margin:28px 0;">
       <a href="${accessUrl}" style="background:${BRAND_COLOR};color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:700;font-size:15px;display:inline-block;">Download my playbook</a>
     </p>
     <p style="text-align:center;margin:0 0 20px;">
       <a href="${invoiceUrl}" style="color:${BRAND_COLOR};font-size:13px;font-weight:600;text-decoration:underline;">Or view/download your invoice anytime</a>
     </p>
     <p style="margin:0;font-size:13px;line-height:1.6;color:#5A1F0C;">You can download the file up to 3 times, from up to 2 of your own devices (e.g. phone and laptop), from this link. Keep this email safe — if you lose the link, contact support with the email you used to order.</p>`,
    logoUrl
  );
}

export function contactNotificationEmail(params: { name: string; email: string; message: string }): string {
  const { name, email, message } = params;
  return emailShell(
    "New contact message",
    `<p style="margin:0 0 6px;font-size:13px;color:#7A2E15;"><strong>From:</strong> ${escapeHtml(name)} (${escapeHtml(email)})</p>
     <div style="margin-top:16px;padding:16px;background:#FBF6F1;border-radius:10px;font-size:14px;line-height:1.6;white-space:pre-line;">${escapeHtml(message)}</div>`
  );
}

export function contactAutoReplyEmail(params: { name: string }): string {
  return emailShell(
    "We got your message",
    `<h1 style="margin:0 0 12px;font-size:22px;color:${BRAND_COLOR};">Thanks for reaching out, ${escapeHtml(params.name)}!</h1>
     <p style="margin:0;font-size:15px;line-height:1.6;">We've received your message and typically reply within 24 hours. In the meantime, feel free to explore the playbook or check your order status.</p>`
  );
}

// Sent to someone who filled the order form but hasn't paid yet — up to 3
// times, at 10 minutes, 1 hour, and 24 hours after they submitted the
// form (see /api/cron/reminders). `stage` picks the tone/urgency and
// subject line for each one.
const REMINDER_COPY = {
  0: {
    subject: "Psst — your playbook is one tap away 👀",
    heading: "Almost there!",
    body: "You started grabbing your copy of The Ecommerce Playbook a few minutes ago, but the checkout never finished. No rush — your spot's still saved.",
  },
  1: {
    subject: "Still thinking it over? Your copy's waiting ⏳",
    heading: "Your playbook is still waiting",
    body: "It's been an hour since you filled the form — your details are safe and your link is still ready whenever you are. Finish checkout in under a minute and it's yours.",
  },
  2: {
    subject: "Last call — your link expires from our reminders today 🔔",
    heading: "One final nudge",
    body: "This is the last reminder we'll send — after this we'll leave you be. If you still want The Ecommerce Playbook, this is the moment to grab it.",
  },
} as const;

export function paymentReminderEmail(params: { name: string; checkoutUrl: string; stage: 0 | 1 | 2; logoUrl?: string }): {
  subject: string;
  html: string;
} {
  const { name, checkoutUrl, stage, logoUrl } = params;
  const copy = REMINDER_COPY[stage];
  const html = emailShell(
    copy.heading,
    `<h1 style="margin:0 0 12px;font-size:22px;color:${BRAND_COLOR};">Hey ${escapeHtml(name)},</h1>
     <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${copy.body}</p>
     <p style="text-align:center;margin:28px 0;">
       <a href="${checkoutUrl}" style="background:${BRAND_COLOR};color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:700;font-size:15px;display:inline-block;">Complete my order</a>
     </p>
     <p style="margin:0;font-size:12px;line-height:1.6;color:#5A1F0C;">If you already paid and got this by mistake, you can ignore this — sorry for the noise!</p>`,
    logoUrl
  );
  return { subject: copy.subject, html };
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
