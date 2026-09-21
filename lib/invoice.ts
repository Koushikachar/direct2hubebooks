import { PDFDocument, StandardFonts, rgb, type PDFImage } from "pdf-lib"
import type { Submission } from "@prisma/client"
import { getSiteUrl } from "@/lib/siteUrl";
import { BRAND_LOGO_PNG_BASE64 } from "@/lib/brandLogo";
import { isAllowedMediaUrl } from "@/lib/validators";

const BRAND = rgb(0.757, 0.267, 0.055); // ~#C1440E
const INK = rgb(0.169, 0.059, 0.031); // ~#2B0F08
const MUTED = rgb(0.42, 0.24, 0.18);

// "Thu, 18 Sep 2026 · 3:42 PM IST" — real day-of-week and time-of-day,
// not just a bare date, and always in the store's own timezone
// regardless of which region the server happens to run in.
function formatInvoiceDateTime(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${get("weekday")}, ${get("day")} ${get("month")} ${get("year")} \u00b7 ${get("hour")}:${get(
    "minute"
  )} ${get("dayPeriod").toUpperCase()} IST`;
}

// Best-effort logo fetch + embed. Resolves a relative admin-uploaded
// path (e.g. "/uploads/logo.png") against the site's own URL, embeds it
// as whichever raster format it actually is, and swallows any failure
// (missing file, non-PNG/JPEG, network hiccup) so a bad logo can never
// break invoice generation — the header just falls back to text-only.
// The path every product starts with until an admin uploads a real logo —
// a grey-brown circle reading "D2H". It is never worth putting on an invoice:
// the built-in Direct2hub logo below is used instead.
const PLACEHOLDER_LOGO_PATH = "/uploads/logo-placeholder.png";

// The real Direct2hub logo, bundled with the app (see lib/brandLogo.ts). Can't
// fail, so every invoice gets a logo even if the admin's own logo is missing,
// is an unsupported format (e.g. WebP — PDFs can only embed PNG/JPEG here), or
// can't be fetched.
async function embedBrandLogo(doc: PDFDocument): Promise<PDFImage | null> {
  try {
    return await doc.embedPng(Buffer.from(BRAND_LOGO_PNG_BASE64, "base64"));
  } catch (err) {
    console.warn("Invoice brand logo embed skipped:", err);
    return null;
  }
}

async function tryEmbedLogo(doc: PDFDocument, logoUrl: string | undefined): Promise<PDFImage | null> {
  if (!logoUrl || logoUrl === PLACEHOLDER_LOGO_PATH) return null;
  try {
    // The logo URL is admin-editable text, and this code fetches it from the
    // SERVER — so only this site's own files and this project's Supabase
    // Storage host are ever requested. (Otherwise a saved URL such as
    // http://169.254.169.254/… would make the server call internal/cloud
    // metadata addresses: server-side request forgery.)
    if (!isAllowedMediaUrl(logoUrl)) return null;
    const absoluteUrl = logoUrl.startsWith("http") ? logoUrl : `${getSiteUrl()}${logoUrl}`;
    const res = await fetch(absoluteUrl, { signal: AbortSignal.timeout(5000), redirect: "error" });
    if (!res.ok) return null;
    const declared = Number(res.headers.get("content-length") || 0);
    if (declared > 2 * 1024 * 1024) return null;
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > 2 * 1024 * 1024) return null;
    const bytes = new Uint8Array(buffer);
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("png") || logoUrl.toLowerCase().endsWith(".png")) {
      return await doc.embedPng(bytes);
    }
    if (contentType.includes("jpeg") || contentType.includes("jpg") || /\.(jpe?g)$/i.test(logoUrl)) {
      return await doc.embedJpg(bytes);
    }
    return null;
  } catch (err) {
    console.warn("Invoice logo embed skipped:", err);
    return null;
  }
}

// Deterministic, human-looking invoice number derived from the
// submission's own id + paid date — no extra DB column needed, and the
// same submission always produces the same invoice number.
export function invoiceNumberFor(submission: Pick<Submission, "id" | "paidAt" | "createdAt">): string {
  const date = submission.paidAt ?? submission.createdAt;
  const stamp = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;
  const shortId = submission.id.slice(-6).toUpperCase();
  return `D2H-${stamp}-${shortId}`;
}

// Which gateway took the money, and its references. New purchases are
// Cashfree; purchases made before the switch still carry their Razorpay
// references (legacy columns), so their invoices keep working unchanged.
function paymentDetailsFor(s: Submission): { gateway: string | null; paymentId: string | null; orderId: string | null } {
  if (s.cashfreeOrderId || s.cashfreePaymentId) {
    return { gateway: "Cashfree", paymentId: s.cashfreePaymentId, orderId: s.cashfreeOrderId };
  }
  return { gateway: null, paymentId: null, orderId: null };
}

// Long ids don't fit the narrow table column — keep both ends readable.
function shorten(value: string, max: number): string {
  if (value.length <= max) return value;
  const keep = Math.floor((max - 1) / 2);
  return `${value.slice(0, keep)}\u2026${value.slice(-keep)}`;
}

interface InvoiceParams {
  submission: Submission;
  productTitle: string;
  supportEmail?: string;
  logoUrl?: string;
}

/**
 * Renders a one-page order invoice as a PDF buffer. Generated on demand
 * from data already in the database — nothing is cached or written to
 * storage, so there's no separate invoice file to leak or go stale.
 */
export async function generateInvoicePdf({
  submission,
  productTitle,
  supportEmail,
  logoUrl,
}: InvoiceParams): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  // Header logo: the admin's own uploaded logo when there is a usable one,
  // otherwise the built-in Direct2hub logo. The footer always carries the
  // built-in Direct2hub logo.
  const brandLogo = await embedBrandLogo(doc);
  const logoImg = (await tryEmbedLogo(doc, logoUrl)) ?? brandLogo;

  const { width, height } = page.getSize();
  const marginX = 56;
  let y = height - 64;

  const draw = (text: string, x: number, yPos: number, opts: { size?: number; f?: typeof font; color?: typeof INK } = {}) => {
    page.drawText(text, {
      x,
      y: yPos,
      size: opts.size ?? 11,
      font: opts.f ?? font,
      color: opts.color ?? INK,
    });
  };

  // Header — brand band with logo (when one is on file) beside the
  // wordmark, and a one-line tagline under it so the invoice reads as a
  // proper piece of Direct2hub branding rather than a bare "invoice".
  page.drawRectangle({ x: 0, y: height - 96, width, height: 96, color: BRAND });

  let titleX = marginX;
  if (logoImg) {
    const boxSize = 56;
    // Leave a little white padding around the mark inside its box.
    const inner = boxSize - 8;
    const scale = Math.min(inner / logoImg.width, inner / logoImg.height);
    const w = logoImg.width * scale;
    const h = logoImg.height * scale;
    page.drawRectangle({ x: marginX, y: height - 48 - boxSize / 2, width: boxSize, height: boxSize, color: rgb(1, 1, 1) });
    page.drawImage(logoImg, {
      x: marginX + (boxSize - w) / 2,
      y: height - 48 - boxSize / 2 + (boxSize - h) / 2,
      width: w,
      height: h,
    });
    titleX = marginX + boxSize + 16;
  }
  page.drawText("Direct2hub", { x: titleX, y: height - 50, size: 22, font: bold, color: rgb(1, 1, 1) });
  page.drawText("Order Invoice \u2014 The Ecommerce Playbook", { x: titleX, y: height - 72, size: 11, font, color: rgb(1, 1, 1) });
  y = height - 128;

  const invoiceNo = invoiceNumberFor(submission);
  const paidDate = submission.paidAt ?? submission.createdAt;
  const rightX = width - marginX - 200;

  draw("Invoice #:", rightX, y, { f: bold });
  draw(invoiceNo, rightX + 70, y);
  y -= 16;
  draw("Date:", rightX, y, { f: bold });
  draw(formatInvoiceDateTime(paidDate), rightX + 70, y, { size: 9.5 });
  y -= 16;
  draw("Status:", rightX, y, { f: bold });
  draw(submission.paymentStatus === "paid" ? "PAID" : submission.paymentStatus.toUpperCase(), rightX + 70, y, {
    color: submission.paymentStatus === "paid" ? rgb(0.11, 0.5, 0.24) : MUTED,
  });

  // Bill To
  y = height - 128;
  draw("Bill To", marginX, y, { f: bold, size: 12, color: BRAND });
  y -= 18;
  draw(submission.name, marginX, y);
  y -= 15;
  draw(submission.email, marginX, y);
  y -= 15;
  draw(`${submission.countryCode} ${submission.whatsapp}`, marginX, y);

  // Divider
  y -= 30;
  page.drawLine({ start: { x: marginX, y }, end: { x: width - marginX, y }, thickness: 1, color: rgb(0.85, 0.8, 0.76) });

  // Line items table
  y -= 28;
  draw("Item", marginX, y, { f: bold });
  draw("Payment ref.", marginX + 250, y, { f: bold });
  draw("Amount", width - marginX - 80, y, { f: bold });
  y -= 10;
  page.drawLine({ start: { x: marginX, y }, end: { x: width - marginX, y }, thickness: 1, color: rgb(0.85, 0.8, 0.76) });
  y -= 22;

  const amountLabel = `Rs. ${(submission.amountPaise / 100).toFixed(2)}`;
  const pay = paymentDetailsFor(submission);
  const paymentRef = pay.paymentId || pay.orderId || "\u2014";

  draw(productTitle.slice(0, 42), marginX, y);
  draw(shorten(paymentRef, 30), marginX + 250, y, { size: 9, color: MUTED });
  draw(amountLabel, width - marginX - 80, y);
  y -= 30;

  page.drawLine({ start: { x: marginX, y }, end: { x: width - marginX, y }, thickness: 1, color: rgb(0.85, 0.8, 0.76) });
  y -= 24;
  draw("Total Paid", width - marginX - 200, y, { f: bold, size: 13 });
  draw(amountLabel, width - marginX - 80, y, { f: bold, size: 13, color: BRAND });

  // Payment details — who processed it and the references to quote if
  // there is ever a question about this payment.
  if (pay.gateway) {
    y -= 48;
    draw("Payment details", marginX, y, { f: bold, size: 12, color: BRAND });
    y -= 18;
    draw("Paid via:", marginX, y, { f: bold, size: 10 });
    draw(`${pay.gateway} (UPI / cards / netbanking / wallets)`, marginX + 78, y, { size: 10 });
    if (pay.paymentId) {
      y -= 15;
      draw("Payment ID:", marginX, y, { f: bold, size: 10 });
      draw(pay.paymentId, marginX + 78, y, { size: 10 });
    }
    if (pay.orderId) {
      y -= 15;
      draw("Order ID:", marginX, y, { f: bold, size: 10 });
      draw(pay.orderId, marginX + 78, y, { size: 10 });
    }
  }

  // Footer
  const footerY = 90;
  const siteHost = getSiteUrl().replace(/^https?:\/\//, "");
  page.drawLine({ start: { x: marginX, y: footerY + 24 }, end: { x: width - marginX, y: footerY + 24 }, thickness: 1, color: rgb(0.85, 0.8, 0.76) });
  const footerLogoSize = 18;
  let footerTextX = marginX;
  if (brandLogo) {
    page.drawImage(brandLogo, { x: marginX, y: footerY - 4, width: footerLogoSize, height: footerLogoSize });
    footerTextX = marginX + footerLogoSize + 8;
  }
  draw(`Direct2hub \u00b7 ${siteHost}`, footerTextX, footerY, { size: 9, color: MUTED, f: bold });
  draw(
    "This is a system-generated invoice and does not require a signature.",
    marginX,
    footerY - 14,
    { size: 9, color: MUTED }
  );
  draw(
    `Questions about this order? Contact ${supportEmail || "support"} and reference invoice ${invoiceNo}.`,
    marginX,
    footerY - 28,
    { size: 9, color: MUTED }
  );

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
