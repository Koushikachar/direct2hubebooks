import { after } from "next/server";
import { prisma } from "@/lib/db";
import { CURRENCY, PRODUCT_PRICE_PAISE } from "@/lib/pricing";
import { fetchCashfreeOrder, fetchSuccessfulPaymentId, submissionIdFromOrderId } from "@/lib/cashfree";
import { sendMail, orderConfirmationEmail } from "@/lib/mailer";
import { getSiteUrl } from "@/lib/siteUrl";
import { logSecurityEvent } from "@/lib/securityLog";
import { generateInvoicePdf, invoiceNumberFor } from "@/lib/invoice";
import type { Submission } from "@prisma/client";

export type PaymentOutcome =
  | {
      status: "paid";
      token: string;
      newlyPaid: boolean;
      /** The order id that actually settled the purchase. Callers must only
       *  reveal `token` to someone presenting THIS order id (see paymentProof). */
      paidOrderId: string | null;
    }
  /** Order exists but has no successful payment (yet). */
  | { status: "unpaid" }
  /** The order expired / was terminated — a fresh one must be created. */
  | { status: "expired" }
  /** Not one of our orders, or its amount/currency isn't what we charge. */
  | { status: "invalid" };

// The one place a purchase is ever marked as paid. Three independent paths
// funnel into it — the browser after the checkout closes (/api/payment/verify),
// Cashfree's server-to-server webhook (/api/payment/webhook), and the return
// page (/payment/return) — so a buyer who pays and then closes the tab, loses
// signal, or is bounced through an in-app browser still gets their access.
//
// Nothing the browser (or even a webhook body) says is trusted: the order is
// always read back from Cashfree with our secret key, and the status, amount
// and currency are checked before anything is unlocked.
//
// It is idempotent and race-safe: the paid flag is set with a conditional
// UPDATE, and only the call that actually flips it sends the confirmation
// email — so webhook + verify arriving together never double-email.
export async function confirmCashfreePayment(orderId: string): Promise<PaymentOutcome> {
  const submissionId = submissionIdFromOrderId(orderId);
  if (!submissionId) return { status: "invalid" };

  const submission = await prisma.submission.findUnique({ where: { id: submissionId } });
  if (!submission) return { status: "invalid" };

  if (submission.paymentStatus === "paid") {
    return { status: "paid", token: submission.accessToken, newlyPaid: false, paidOrderId: submission.cashfreeOrderId };
  }

  const order = await fetchCashfreeOrder(orderId);
  if (order.order_id !== orderId) return { status: "invalid" };

  if (order.order_status !== "PAID") {
    return order.order_status === "EXPIRED" ||
      order.order_status === "TERMINATED" ||
      order.order_status === "TERMINATION_REQUESTED"
      ? { status: "expired" }
      : { status: "unpaid" };
  }

  // Paid — but for the right thing? (Guards against a mis-priced or
  // tampered order ever unlocking the product.)
  const paidPaise = Math.round(Number(order.order_amount) * 100);
  if (order.order_currency !== CURRENCY || paidPaise !== PRODUCT_PRICE_PAISE) {
    console.error(`Cashfree order ${orderId} is PAID but amount/currency mismatch:`, order.order_amount, order.order_currency);
    logSecurityEvent("payment_amount_mismatch", { orderId });
    return { status: "invalid" };
  }

  // Best-effort — the payment reference only decorates the invoice.
  const paymentId = await fetchSuccessfulPaymentId(orderId).catch(() => null);

  const { count } = await prisma.submission.updateMany({
    where: { id: submission.id, paymentStatus: { not: "paid" } },
    data: {
      paymentStatus: "paid",
      cashfreeOrderId: orderId,
      cashfreePaymentId: paymentId,
      amountPaise: PRODUCT_PRICE_PAISE,
      paidAt: new Date(),
    },
  });

  if (count === 1) {
    const paid = await prisma.submission.findUnique({ where: { id: submission.id } });
    if (paid) runAfterResponse(() => sendOrderConfirmation(paid));
  }

  return { status: "paid", token: submission.accessToken, newlyPaid: count === 1, paidOrderId: orderId };
}

// Sends the email after the HTTP response has gone out (Next's after() keeps
// serverless functions alive until it finishes), so the buyer never waits on
// PDF generation + SMTP. Outside a request scope (scripts/tests) it simply
// runs immediately.
function runAfterResponse(task: () => Promise<void>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}

// Best-effort confirmation email — never blocks the response, and a failure
// here doesn't affect the (already-verified) payment. The invoice PDF is
// generated first, then both attached to the email and linked, so the buyer
// can always pull it up again later.
async function sendOrderConfirmation(paid: Submission): Promise<void> {
  try {
    const siteUrl = getSiteUrl();
    const amountLabel = `₹${(paid.amountPaise / 100).toFixed(0)}`;
    const invoiceNumber = invoiceNumberFor(paid);
    const product = await prisma.product.findFirst({ orderBy: { updatedAt: "desc" } });

    const invoicePdf = await generateInvoicePdf({
      submission: paid,
      productTitle: product?.title || "Direct2hub order",
      supportEmail: process.env.GMAIL_USER,
      logoUrl: product?.logoUrl,
    });

    await sendMail({
      to: paid.email,
      subject: "Your Ecommerce Playbook is ready to download 🎉",
      html: orderConfirmationEmail({
        name: paid.name,
        accessUrl: `${siteUrl}/access/${paid.accessToken}`,
        invoiceUrl: `${siteUrl}/api/invoice/${paid.accessToken}`,
        amountLabel,
        invoiceNumber,
        logoUrl: product?.logoUrl,
      }),
      attachments: [{ filename: `invoice-${invoiceNumber}.pdf`, content: invoicePdf, contentType: "application/pdf" }],
    });
  } catch (err) {
    console.error("Order confirmation email failed:", err);
  }
}
