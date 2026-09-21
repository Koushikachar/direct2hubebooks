import crypto from "crypto";

// Server-only Cashfree Payment Gateway client. Talks to Cashfree's REST API
// directly with fetch (no SDK dependency to keep in sync) — the calls we need
// are just: create order, fetch order, fetch an order's payments, and verify
// a webhook signature.
//
// CASHFREE_SECRET_KEY must never reach the browser. Going from test to live
// needs no code change: swap CASHFREE_APP_ID / CASHFREE_SECRET_KEY for your
// production keys and set CASHFREE_ENV=production.

// Cashfree's Payment Gateway API version, sent as the x-api-version header.
const API_VERSION = "2025-01-01";
const REQUEST_TIMEOUT_MS = 15_000;

export type CashfreeMode = "sandbox" | "production";

export class CashfreeConfigError extends Error {}

export class CashfreeApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

interface CashfreeConfig {
  appId: string;
  secretKey: string;
  mode: CashfreeMode;
  baseUrl: string;
}

export function getCashfreeConfig(): CashfreeConfig {
  const appId = process.env.CASHFREE_APP_ID?.trim();
  const secretKey = process.env.CASHFREE_SECRET_KEY?.trim();
  if (!appId || !secretKey) {
    throw new CashfreeConfigError("CASHFREE_APP_ID and CASHFREE_SECRET_KEY must be set to accept payments.");
  }
  // Sandbox unless production is asked for explicitly — a missing or
  // misspelled value can never accidentally point test code at live money.
  const env = (process.env.CASHFREE_ENV || "").trim().toLowerCase();
  const mode: CashfreeMode = env === "production" || env === "prod" || env === "live" ? "production" : "sandbox";
  return {
    appId,
    secretKey,
    mode,
    baseUrl: mode === "production" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg",
  };
}

async function cashfreeFetch<T>(path: string, init: { method: "GET" | "POST"; body?: unknown }): Promise<T> {
  const cfg = getCashfreeConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.baseUrl}${path}`, {
      method: init.method,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-api-version": API_VERSION,
        "x-client-id": cfg.appId,
        "x-client-secret": cfg.secretKey,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // non-JSON error body — handled below
    }
    if (!res.ok) {
      const err = (data || {}) as { message?: string; code?: string };
      throw new CashfreeApiError(err.message || `Cashfree request failed (${res.status})`, res.status, err.code);
    }
    return data as T;
  } catch (err) {
    if (err instanceof CashfreeApiError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new CashfreeApiError("Cashfree did not respond in time.", 504, "timeout");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ── Order ids ───────────────────────────────────────────────────────────
// Every payment attempt gets its own Cashfree order id (Cashfree ids must be
// unique). The submission id is embedded in it so that ANY attempt a buyer
// actually paid — even an earlier one, after they clicked "Pay" again — can
// be traced back to the right purchase without depending on which attempt
// happened to be saved last. Allowed characters: letters, digits, _ and -
// (max 50) — the shape below is ~40.
const ORDER_ID_PREFIX = "d2h";
const ORDER_ID_PATTERN = /^d2h_([A-Za-z0-9]{10,40})_[a-z0-9]{4,12}$/;

export function buildOrderId(submissionId: string): string {
  return `${ORDER_ID_PREFIX}_${submissionId}_${Date.now().toString(36)}`;
}

export function submissionIdFromOrderId(orderId: string): string | null {
  const match = ORDER_ID_PATTERN.exec(orderId);
  return match ? match[1] : null;
}

// ── Create order ────────────────────────────────────────────────────────
export interface CreateCashfreeOrderInput {
  orderId: string;
  /** Cashfree takes rupees (e.g. 199.00), not paise. */
  amountInr: number;
  currency: string;
  customer: { id: string; name?: string; email: string; phone: string };
  /** Only https URLs are accepted by Cashfree in production. */
  returnUrl?: string;
  notifyUrl?: string;
  note?: string;
  expiresInMinutes?: number;
}

export interface CashfreeOrderSession {
  orderId: string;
  cfOrderId: string;
  paymentSessionId: string;
  mode: CashfreeMode;
}

// Cashfree validates customer names strictly — keep letters, marks, spaces
// and a few punctuation marks, and drop the field entirely if nothing is left.
function cleanName(name?: string): string | undefined {
  if (!name) return undefined;
  const cleaned = name.replace(/[^\p{L}\p{M} .'-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 100);
  return cleaned || undefined;
}

export async function createCashfreeOrder(input: CreateCashfreeOrderInput): Promise<CashfreeOrderSession> {
  const cfg = getCashfreeConfig();
  const expiry = new Date(Date.now() + (input.expiresInMinutes ?? 60) * 60_000).toISOString();

  const body: Record<string, unknown> = {
    order_id: input.orderId,
    order_amount: input.amountInr,
    order_currency: input.currency,
    customer_details: {
      customer_id: input.customer.id,
      customer_email: input.customer.email,
      customer_phone: input.customer.phone,
      ...(cleanName(input.customer.name) ? { customer_name: cleanName(input.customer.name) } : {}),
    },
    order_expiry_time: expiry,
    ...(input.note ? { order_note: input.note.slice(0, 200) } : {}),
  };
  const meta: Record<string, string> = {};
  if (input.returnUrl) meta.return_url = input.returnUrl;
  if (input.notifyUrl) meta.notify_url = input.notifyUrl;
  if (Object.keys(meta).length) body.order_meta = meta;

  const order = await cashfreeFetch<{
    order_id?: string;
    cf_order_id?: string | number;
    payment_session_id?: string;
  }>("/orders", { method: "POST", body });

  if (!order.payment_session_id || !order.order_id) {
    throw new CashfreeApiError("Cashfree did not return a payment session.", 502);
  }
  return {
    orderId: order.order_id,
    cfOrderId: String(order.cf_order_id ?? ""),
    paymentSessionId: order.payment_session_id,
    mode: cfg.mode,
  };
}

// ── Read back an order (the source of truth for "did they pay?") ────────
export interface CashfreeOrder {
  order_id: string;
  order_amount: number | string;
  order_currency: string;
  /** ACTIVE | PAID | EXPIRED | TERMINATED | TERMINATION_REQUESTED */
  order_status: string;
}

export async function fetchCashfreeOrder(orderId: string): Promise<CashfreeOrder> {
  return cashfreeFetch<CashfreeOrder>(`/orders/${encodeURIComponent(orderId)}`, { method: "GET" });
}

/** The successful payment's Cashfree id, for the invoice/payment reference. */
export async function fetchSuccessfulPaymentId(orderId: string): Promise<string | null> {
  const payments = await cashfreeFetch<Array<{ cf_payment_id?: string | number; payment_status?: string }>>(
    `/orders/${encodeURIComponent(orderId)}/payments`,
    { method: "GET" }
  );
  const ok = Array.isArray(payments) ? payments.find((p) => p.payment_status === "SUCCESS") : undefined;
  return ok?.cf_payment_id !== undefined ? String(ok.cf_payment_id) : null;
}

// ── Webhooks ────────────────────────────────────────────────────────────
// Cashfree signs every webhook: base64( HMAC-SHA256( timestamp + rawBody,
// <your PG secret key> ) ), sent in x-webhook-signature next to
// x-webhook-timestamp. The RAW body must be used — re-serialising parsed
// JSON changes the bytes and breaks the signature.
export function verifyWebhookSignature(rawBody: string, signature: string | null, timestamp: string | null): boolean {
  if (!signature || !timestamp) return false;
  const { secretKey } = getCashfreeConfig();
  const expected = crypto.createHmac("sha256", secretKey).update(timestamp + rawBody).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
