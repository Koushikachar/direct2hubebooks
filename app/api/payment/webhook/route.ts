import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/cashfree";
import { confirmCashfreePayment } from "@/lib/paymentFinalize";
import { logSecurityEvent } from "@/lib/securityLog";
import { getClientIp } from "@/lib/rateLimit";

// Cashfree → this server, whenever a payment on one of our orders settles.
// This is what completes a purchase when the buyer pays and then closes the
// tab, loses signal, or never comes back to the site: the order is confirmed
// and the access email goes out regardless of what their browser did.
//
// The URL is attached to every order as `notify_url` (see create-order), so
// nothing needs configuring in the Cashfree dashboard — though you can also
// add https://YOUR-DOMAIN/api/payment/webhook there and use its "Test" button.
export async function POST(req: Request) {
  // The signature covers the exact bytes Cashfree sent — read the body as
  // raw text and only parse it after it has been verified.
  const rawBody = await req.text();

  let valid = false;
  try {
    valid = verifyWebhookSignature(rawBody, req.headers.get("x-webhook-signature"), req.headers.get("x-webhook-timestamp"));
  } catch (err) {
    console.error("Cashfree webhook: gateway not configured:", err);
    return NextResponse.json({ error: "Not configured." }, { status: 500 });
  }
  if (!valid) {
    logSecurityEvent("webhook_bad_signature", { ip: getClientIp(req) });
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let payload: { type?: string; data?: { order?: { order_id?: string } } };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  // Only successful payments matter here; failed / user-dropped events are
  // acknowledged and ignored (the buyer can simply try again).
  if (payload.type !== "PAYMENT_SUCCESS_WEBHOOK") {
    return NextResponse.json({ ok: true, ignored: payload.type ?? "unknown" });
  }

  const orderId = payload.data?.order?.order_id;
  if (!orderId) return NextResponse.json({ ok: true, ignored: "no order id" });

  try {
    // Re-reads the order from Cashfree — the webhook body is only a hint.
    const outcome = await confirmCashfreePayment(orderId);
    return NextResponse.json({ ok: true, status: outcome.status });
  } catch (err) {
    // A 5xx makes Cashfree retry the delivery later.
    console.error("Cashfree webhook processing error:", err);
    return NextResponse.json({ error: "Could not process webhook." }, { status: 500 });
  }
}
