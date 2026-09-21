import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  buildOrderId,
  createCashfreeOrder,
  CashfreeApiError,
  CashfreeConfigError,
} from "@/lib/cashfree";
import { PRODUCT_PRICE_PAISE, CURRENCY } from "@/lib/pricing";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { getSiteUrl } from "@/lib/siteUrl";
import { readCookie } from "@/lib/cookies";
import { PAYMENT_PROOF_COOKIE, addPaymentProof, paymentProofCookieOptions } from "@/lib/paymentProof";

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const { success } = await rateLimit(`create-order:${ip}`, 10, 10 * 60_000); // 10 attempts / 10 min / IP
  if (!success) {
    return NextResponse.json({ error: "Too many requests. Please try again in a few minutes." }, { status: 429 });
  }

  try {
    const { submissionId } = (await req.json()) as { submissionId?: string };
    if (!submissionId || typeof submissionId !== "string") {
      return NextResponse.json({ error: "Missing submission." }, { status: 400 });
    }

    const submission = await prisma.submission.findUnique({ where: { id: submissionId } });
    if (!submission) {
      return NextResponse.json({ error: "Submission not found. Please fill the form again." }, { status: 404 });
    }
    if (submission.paymentStatus === "paid") {
      return NextResponse.json({ error: "This has already been paid for." }, { status: 409 });
    }

    // Amount always comes from the server's own price constant — the
    // client only ever tells us WHO is paying, never HOW MUCH. (Cashfree
    // takes rupees, our constant is in paise.)
    const orderId = buildOrderId(submission.id);
    const siteUrl = getSiteUrl();

    // Cashfree only accepts https callback URLs in production; on a local
    // http://localhost the popup checkout still works (it reports back to the
    // page directly), we just skip the redirect/webhook URLs.
    const https = siteUrl.startsWith("https://");

    const session = await createCashfreeOrder({
      orderId,
      amountInr: PRODUCT_PRICE_PAISE / 100,
      currency: CURRENCY,
      customer: {
        id: submission.id,
        name: submission.name,
        email: submission.email,
        // Cashfree wants the national number; +91 is the only country the
        // form offers, anything else is passed with its country code.
        phone:
          submission.countryCode === "+91"
            ? submission.whatsapp.replace(/\D/g, "")
            : `${submission.countryCode}${submission.whatsapp.replace(/\D/g, "")}`,
      },
      returnUrl: https ? `${siteUrl}/payment/return?order_id={order_id}` : undefined,
      notifyUrl: https ? `${siteUrl}/api/payment/webhook` : undefined,
      note: "The Ecommerce Playbook",
    });

    await prisma.submission.update({
      where: { id: submission.id },
      data: { cashfreeOrderId: session.orderId, amountPaise: PRODUCT_PRICE_PAISE },
    });

    // Deliberately no name/email/phone in this response: the caller only
    // needs to open the checkout. (Returning the stored details would let
    // anyone who obtained a submission id read that person's data back.)
    const res = NextResponse.json(
      {
        ok: true,
        orderId: session.orderId,
        paymentSessionId: session.paymentSessionId,
        mode: session.mode,
        amount: PRODUCT_PRICE_PAISE,
        currency: CURRENCY,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
    // Signed proof that THIS browser started this order — see lib/paymentProof.ts.
    res.cookies.set(
      PAYMENT_PROOF_COOKIE,
      addPaymentProof(readCookie(req, PAYMENT_PROOF_COOKIE), session.orderId),
      paymentProofCookieOptions()
    );
    return res;
  } catch (err) {
    console.error("Create order error:", err);

    let hint = "Could not start payment. Please try again.";
    if (err instanceof CashfreeConfigError) {
      hint = "Payments aren't configured yet — set CASHFREE_APP_ID and CASHFREE_SECRET_KEY.";
    } else if (err instanceof CashfreeApiError) {
      if (err.status === 401 || err.status === 403) {
        hint = "Payment gateway rejected the request — check that your Cashfree App ID and Secret Key are correct (and match CASHFREE_ENV).";
      } else if (err.status === 400 || err.status === 422) {
        // The gateway's own wording stays in the server log; the visitor gets
        // an actionable, non-technical message.
        hint = "The payment gateway couldn't accept these details. Please check your name, email and WhatsApp number and try again.";
      }
    }

    return NextResponse.json({ error: hint }, { status: 500 });
  }
}
