// Cashfree's checkout SDK is the only third-party script this site runs, and
// it is tightly controlled:
//
//  - It is NOT in the initial HTML and NOT loaded on page load. Nothing from
//    Cashfree is downloaded (and no Cashfree cookie can be set) until the
//    visitor actually starts paying.
//  - warmUpCashfree() only opens the network connection early (DNS + TLS)
//    the first time someone focuses the order form — a few hundred
//    milliseconds saved at checkout without downloading any of the script.
//  - loadCashfreeScript() then injects the script once (async), and caches
//    the promise so retrying a payment never injects it twice.
//  - The origin is pinned in the site's CSP (script-src / frame-src /
//    connect-src in next.config.ts), so no other host can supply the SDK.
const CASHFREE_SCRIPT_URL = "https://sdk.cashfree.com/js/v3/cashfree.js";

export type CashfreeMode = "sandbox" | "production";

export interface CashfreeCheckoutResult {
  /** Set when the buyer closed the popup or an error happened. */
  error?: { message?: string; code?: string } | unknown;
  /** Set when checkout had to redirect the whole page (in-app browsers). */
  redirect?: boolean;
  /** Set once a payment attempt completed — whatever its final status. */
  paymentDetails?: { paymentMessage?: string };
}

export interface CashfreeInstance {
  checkout: (options: {
    paymentSessionId: string;
    redirectTarget?: "_modal" | "_self" | "_blank" | "_top";
  }) => Promise<CashfreeCheckoutResult | undefined>;
}

declare global {
  interface Window {
    Cashfree?: (config: { mode: CashfreeMode }) => CashfreeInstance;
  }
}

let scriptPromise: Promise<boolean> | null = null;
let warmed = false;

export function warmUpCashfree(): void {
  if (warmed || typeof document === "undefined") return;
  warmed = true;
  const link = document.createElement("link");
  link.rel = "preconnect";
  link.href = "https://sdk.cashfree.com";
  document.head.appendChild(link);
}

export function loadCashfreeScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Cashfree) return Promise.resolve(true);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = CASHFREE_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve(Boolean(window.Cashfree));
    script.onerror = () => {
      // Let a later attempt retry instead of caching the failure forever.
      scriptPromise = null;
      script.remove();
      resolve(false);
    };
    document.body.appendChild(script);
  });

  return scriptPromise;
}
