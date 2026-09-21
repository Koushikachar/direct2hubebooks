import crypto from "crypto";
import { getCashfreeConfig } from "@/lib/cashfree";

// Proof that THIS browser is the one that started a given payment.
//
// Why it exists: a Cashfree order id is not a secret — it is printed on the
// invoice PDF (which people forward to accountants), sits in return-URL query
// strings and browser history, and is visible in the Cashfree dashboard. If
// "I know a paid order id" were enough to be handed the buyer's download
// token, anyone who ever saw an invoice could take the file. So /api/payment/
// create-order also sets a small httpOnly cookie holding a signed
// `<orderId>.<mac>` entry for each order this browser created, and the token
// is only ever revealed to a browser that can present the matching entry.
// Everyone else gets "paid — check your email" instead.
export const PAYMENT_PROOF_COOKIE = "d2h_pay";
export const PAYMENT_PROOF_MAX_AGE_SECONDS = 60 * 60 * 3; // 3 hours
const MAX_ENTRIES = 3; // the last few attempts survive a retry

function mac(orderId: string): string {
  return crypto
    .createHmac("sha256", getCashfreeConfig().secretKey)
    .update(`d2h-pay-proof:${orderId}`)
    .digest("hex")
    .slice(0, 32);
}

/** New cookie value: this order first, then the previous few (still valid ones). */
export function addPaymentProof(existing: string | undefined, orderId: string): string {
  const kept = (existing || "")
    .split(",")
    .filter((entry) => entry && !entry.startsWith(`${orderId}.`))
    .slice(0, MAX_ENTRIES - 1);
  return [`${orderId}.${mac(orderId)}`, ...kept].join(",");
}

export function hasPaymentProof(cookieValue: string | undefined, orderId: string): boolean {
  if (!cookieValue || !orderId) return false;
  const expected = `${orderId}.${mac(orderId)}`;
  return cookieValue.split(",").some((entry) => {
    const a = Buffer.from(entry);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

export function paymentProofCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // Lax, not Strict: Cashfree's redirect back to /payment/return is a
    // cross-site top-level navigation, and it must still carry the cookie.
    sameSite: "lax" as const,
    path: "/",
    maxAge: PAYMENT_PROOF_MAX_AGE_SECONDS,
  };
}
