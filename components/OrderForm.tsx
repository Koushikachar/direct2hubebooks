"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { loadCashfreeScript, warmUpCashfree, type CashfreeMode } from "@/lib/loadCashfreeScript";

// Code-split: the terms text is only needed if someone opens it.
const TermsModal = dynamic(() => import("./TermsModal"), { ssr: false });

const COUNTRY_CODES = [{ code: "+91", label: "IN +91" }];

const PRICE_LABEL = "₹199";

interface OrderFormState {
  name: string;
  email: string;
  countryCode: string;
  whatsapp: string;
}

interface OrderData {
  submissionId: string;
  orderId: string;
  /** Cashfree's one-time session for this order — what opens the checkout. */
  paymentSessionId: string;
  /** "sandbox" while testing, "production" once you go live. */
  mode: CashfreeMode;
  amount: number;
  currency: string;
  name: string;
  email: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Step = "details" | "payment";
type Status = "idle" | "loading" | "error";

export default function OrderForm() {
  const router = useRouter();
  const [form, setForm] = useState<OrderFormState>({
    name: "",
    email: "",
    countryCode: "+91",
    whatsapp: "",
  });
  // Bot protection (see lib/botProtection.ts) — a hidden field real users
  // never see or fill, and the moment this form first rendered. Captured
  // once via useState's lazy initializer, not on every render.
  const [website, setWebsite] = useState("");
  const [formRenderedAt] = useState(() => Date.now());
  const [step, setStep] = useState<Step>("details");
  const [order, setOrder] = useState<OrderData | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  // Payment confirmed, but the download link can only go to the buyer's email.
  const [paidEmailOnly, setPaidEmailOnly] = useState(false);
  const [message, setMessage] = useState("");
  const [termsOpen, setTermsOpen] = useState(false);

  function update<K extends keyof OrderFormState>(
    field: K,
    value: OrderFormState[K],
  ) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  // Step 1: save contact details, then immediately create the Cashfree
  // order so the payment step is ready to go with a single "Pay" click.
  async function handleDetailsSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      const submitRes = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, website, formRenderedAt }),
      });
      const submitData = await submitRes.json();
      if (!submitRes.ok)
        throw new Error(submitData.error || "Something went wrong");

      const orderRes = await fetch("/api/payment/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: submitData.submissionId }),
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok)
        throw new Error(orderData.error || "Could not start payment");

      setOrder({
        submissionId: submitData.submissionId,
        orderId: orderData.orderId,
        paymentSessionId: orderData.paymentSessionId,
        mode: orderData.mode,
        amount: orderData.amount,
        currency: orderData.currency,
        // Shown back to the buyer from what THEY typed — the server no longer
        // echoes stored personal details.
        name: form.name.trim(),
        email: form.email.trim(),
      });
      setStatus("idle");
      setStep("payment");
    } catch (err) {
      setStatus("error");
      setMessage(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
    }
  }

  // Asks OUR server whether an order was really paid — the server asks
  // Cashfree directly, so nothing the browser reports is ever trusted.
  // Redirects to the download page when it was.
  async function checkPayment(orderId: string): Promise<"paid" | "unpaid" | "expired"> {
    const res = await fetch("/api/payment/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Payment verification failed.");
    if (data.status === "paid") {
      if (data.token) {
        router.push(`/access/${data.token}`);
      } else {
        // Paid, but this browser can't prove it started the payment (e.g. it
        // was continued on another device) — the link is in their email.
        setPaidEmailOnly(true);
      }
    }
    return data.status;
  }

  // The session/order can expire (or be used up); quietly get a fresh one.
  async function refreshOrder(current: OrderData) {
    const res = await fetch("/api/payment/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionId: current.submissionId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not restart payment");
    setOrder({ ...current, orderId: data.orderId, paymentSessionId: data.paymentSessionId, mode: data.mode });
  }

  // Step 2: open Cashfree's checkout popup with the order created above.
  async function handlePay() {
    if (!order) return;
    setStatus("loading");
    setMessage("");
    try {
      const loaded = await loadCashfreeScript();
      if (!loaded || !window.Cashfree)
        throw new Error(
          "Could not load the payment gateway. Check your connection and try again.",
        );

      const cashfree = window.Cashfree({ mode: order.mode });
      const result = await cashfree.checkout({
        paymentSessionId: order.paymentSessionId,
        redirectTarget: "_modal",
      });

      // Exceptional case (in-app browsers): the page itself is being sent to
      // Cashfree and will come back through /payment/return, which does the
      // same server-side check and continues to the download page.
      if (result?.redirect) return;

      // The popup closed. Whether the buyer paid, closed it, or hit an error,
      // the server decides — never the browser.
      const paymentMessage = result?.paymentDetails?.paymentMessage || "";
      const attempted = Boolean(result?.paymentDetails);
      // A clearly-failed attempt doesn't need a long wait for a confirmation.
      const clearlyFailed = attempted && paymentMessage !== "" && !/success|pending|process/i.test(paymentMessage);

      if (attempted) setMessage("Confirming your payment…");
      let outcome = await checkPayment(order.orderId);
      if (outcome === "paid") return; // navigating to the download page

      // UPI apps and some banks confirm a few seconds after the popup closes.
      if (attempted && !clearlyFailed) {
        for (let i = 0; i < 4 && outcome === "unpaid"; i++) {
          await sleep(2500);
          outcome = await checkPayment(order.orderId);
          if (outcome === "paid") return;
        }
      }

      if (outcome === "expired") {
        await refreshOrder(order);
        setStatus("error");
        setMessage("That payment session expired, so we refreshed it. Please press Pay again.");
        return;
      }

      if (clearlyFailed) {
        setStatus("error");
        setMessage(`Payment wasn't successful (${paymentMessage}). You can try again.`);
      } else if (attempted) {
        setStatus("error");
        setMessage(
          "We haven't received confirmation of your payment yet. If money was deducted, your download link will be emailed to you shortly — no need to pay again.",
        );
      } else {
        setStatus("idle");
        setMessage("Payment window closed — no money was taken. You can try again whenever you're ready.");
      }
    } catch (err) {
      setStatus("error");
      setMessage(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
    }
  }

  const isTestMode = order?.mode === "sandbox";

  if (paidEmailOnly) {
    return (
      <div className="card space-y-3 p-6 text-center" role="status">
        <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[#25D366] text-xl text-white">✓</div>
        <h2 className="font-display text-xl font-bold">Payment received</h2>
        <p className="text-sm text-brick-700/80">
          We&apos;ve emailed your download link and invoice to <strong>{order?.email || form.email}</strong>. It can take a
          minute or two to arrive — check your spam folder if you don&apos;t see it.
        </p>
      </div>
    );
  }

  if (step === "payment" && order) {
    return (
      <div className="card space-y-4 p-6">
        <div className="flex items-center gap-2 rounded-lg bg-ember-600/10 px-3 py-2 text-sm font-medium text-ember-600">
          <span>✓</span> Details saved for {order.name}
        </div>

        {isTestMode && (
          <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-center text-xs font-medium text-amber-700">
            Test mode — no real money will be charged. Use Cashfree&apos;s
            sandbox test payment details.
          </div>
        )}

        <div className="rounded-lg border border-brick-700/10 p-4 text-center">
          <p className="text-sm text-brick-700/80">Amount to pay</p>
          <p className="font-display text-3xl font-bold text-ember-600">
            {PRICE_LABEL}
          </p>
        </div>

        <button
          type="button"
          onClick={handlePay}
          disabled={status === "loading"}
          className="w-full rounded-lg bg-ember-600 py-3 font-semibold text-white transition hover:bg-ember-500 disabled:opacity-60"
        >
          {status === "loading" ? (message ? "Confirming payment…" : "Opening payment…") : `Pay ${PRICE_LABEL}`}
        </button>

        <button
          type="button"
          onClick={() => setStep("details")}
          className="w-full text-center text-xs text-brick-700/80 underline"
        >
          Edit your details
        </button>

        {message && (
          <p
            role={status === "error" ? "alert" : "status"}
            className={`text-center text-sm ${status === "error" ? "text-red-500" : "text-brick-700/80"}`}
          >
            {message}
          </p>
        )}

        <p className="text-center text-xs text-brick-700/80">
          Payments are processed securely by Cashfree (UPI, cards, netbanking,
          wallets).
        </p>
      </div>
    );
  }

  return (
    <>
      <form onSubmit={handleDetailsSubmit} onFocus={warmUpCashfree} className="card space-y-4 p-6">
        {/* Honeypot — invisible to real visitors (hidden off-screen with
            CSS, not `type="hidden"`, which some bots specifically skip),
            but a simple bot's auto-filler will fill it. tabIndex -1 and
            autoComplete off keep it out of keyboard tabbing and browser
            autofill for genuine users. */}
        <div className="absolute -left-[9999px] top-auto h-0 w-0 overflow-hidden" aria-hidden="true">
          <label htmlFor="website">Website</label>
          <input
            id="website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-ember-600/10 px-3 py-2 text-sm font-medium text-ember-600">
          <span>✓</span> Unlocks Digital Product — {PRICE_LABEL}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-brick-700">
            Name
          </label>
          <input
            required
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="Your full name"
            className="w-full rounded-lg border border-brick-700/20 bg-transparent px-3 py-2.5 outline-none ring-ember-500/40 focus:ring-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-brick-700">
            Email Address
          </label>
          <input
            required
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg border border-brick-700/20 bg-transparent px-3 py-2.5 outline-none ring-ember-500/40 focus:ring-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-brick-700">
            WhatsApp Number
          </label>

          <div className="flex gap-2">
            <select
              value={form.countryCode}
              onChange={(e) => update("countryCode", e.target.value)}
              className="rounded-lg border border-brick-700/20 bg-transparent px-2 py-2.5 outline-none"
            >
              {COUNTRY_CODES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>

            <input
              required
              type="tel"
              inputMode="numeric"
              maxLength={10}
              minLength={10}
              pattern="[6-9][0-9]{9}"
              value={form.whatsapp}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, "").slice(0, 10);

                update("whatsapp", value);
              }}
              placeholder="9876543210"
              className="w-full rounded-lg border border-brick-700/20 bg-transparent px-3 py-2.5 outline-none ring-ember-500/40 focus:ring-2"
            />
          </div>

          {form.whatsapp.length > 0 && form.whatsapp.length !== 10 && (
            <p className="mt-1 text-xs text-red-500">
              WhatsApp number must contain exactly 10 digits.
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={status === "loading"}
          className="w-full rounded-lg bg-ember-600 py-3 font-semibold text-white transition hover:bg-ember-500 disabled:opacity-60"
        >
          {status === "loading"
            ? "Continuing…"
            : `Continue to payment — ${PRICE_LABEL}`}
        </button>

        {status === "error" && (
          <p className="text-center text-sm text-red-500">{message}</p>
        )}

        <p className="text-center text-xs text-brick-700/80">
          By continuing, you agree to Direct2hub's{" "}
          <button
            type="button"
            onClick={() => setTermsOpen(true)}
            className="underline"
          >
            Terms
          </button>{" "}
          and{" "}
          <a href="/refund-policy" target="_blank" rel="noopener noreferrer" className="underline">
            Refund Policy
          </a>
          .
        </p>
      </form>

      {termsOpen && <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)} />}
    </>
  );
}
