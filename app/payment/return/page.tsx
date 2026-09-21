import type { Metadata } from "next";
import Link from "next/link";
import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import Nav from "@/components/Nav";
import { confirmCashfreePayment, type PaymentOutcome } from "@/lib/paymentFinalize";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { PAYMENT_PROOF_COOKIE, hasPaymentProof } from "@/lib/paymentProof";

export const metadata: Metadata = {
  title: "Confirming your payment | Direct2hub",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

// Cashfree sends the buyer here (the order's return_url) when checkout
// finishes in a way that can't report back to the page — the exceptional
// "in-app browser" case, or a bank redirect that leaves the popup. Nothing on
// this page is trusted: the order is checked with Cashfree server-side, and a
// paid one goes straight on to the download page.
export default async function PaymentReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ order_id?: string | string[] }>;
}) {
  const raw = (await searchParams).order_id;
  const orderId = Array.isArray(raw) ? raw[0] : raw;

  let outcome: PaymentOutcome | { status: "error" } = { status: "invalid" };
  if (orderId && orderId.length <= 60) {
    try {
      const ip = getClientIp(new Request("http://internal", { headers: await headers() }));
      const { success } = await rateLimit(`payment-return:${ip}`, 30, 10 * 60_000);
      outcome = success ? await confirmCashfreePayment(orderId) : { status: "error" };
    } catch (err) {
      console.error("Payment return error:", err);
      outcome = { status: "error" };
    }
  }

  // Only the browser that started this payment (signed cookie from
  // create-order) is sent on to the download page; an order id alone — it is
  // printed on invoices — must never be enough to obtain the download link.
  let paidElsewhere = false;
  if (outcome.status === "paid" && orderId) {
    const proof = (await cookies()).get(PAYMENT_PROOF_COOKIE)?.value;
    if (outcome.paidOrderId === orderId && hasPaymentProof(proof, orderId)) {
      // redirect() throws by design — keep it outside any try/catch.
      redirect(`/access/${outcome.token}`);
    }
    paidElsewhere = true;
  }

  const copy = {
    paid: {
      title: "Payment received — check your email",
      body: "Your payment went through. We've emailed your download link and invoice to the address you used at checkout (check spam if it doesn't show up within a couple of minutes).",
    },
    unpaid: {
      title: "We haven't received your payment yet",
      body: "Some banks take a minute or two to confirm. This page refreshes itself — if the money was deducted, your download link will arrive by email shortly, so you don't need to pay again.",
    },
    expired: {
      title: "This payment session expired",
      body: "No money was taken for it. Please start again from the checkout page.",
    },
    invalid: {
      title: "We couldn't find that payment",
      body: "The link looks incomplete. If money was deducted, please contact support with your email address.",
    },
    error: {
      title: "We couldn't check your payment just now",
      body: "This is usually temporary. Please refresh in a moment — if money was deducted, your download link will still be emailed to you.",
    },
  }[paidElsewhere ? "paid" : (outcome.status as "unpaid" | "expired" | "invalid" | "error")];

  return (
    <>
      <Nav />
      {/* A still-processing payment re-checks itself every few seconds. */}
      {(outcome.status === "unpaid" || outcome.status === "error") && orderId && (
        <meta httpEquiv="refresh" content={`5;url=/payment/return?order_id=${encodeURIComponent(orderId)}`} />
      )}
      <main className="mx-auto max-w-xl px-4 py-20 text-center">
        <div className="card space-y-4 p-8">
          <h1 className="font-display text-2xl font-bold">{copy.title}</h1>
          <p className="text-sm text-brick-700/80">{copy.body}</p>
          <Link
            href="/price"
            className="inline-block rounded-lg bg-ember-600 px-6 py-3 font-semibold text-white transition hover:bg-ember-500"
          >
            Back to checkout
          </Link>
        </div>
      </main>
    </>
  );
}
