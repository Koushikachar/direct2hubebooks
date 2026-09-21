// Two lightweight, dependency-free bot signals for public forms (the
// order form and the contact form). No external CAPTCHA service, no API
// key, and no extra friction for real visitors — both checks are
// invisible to a human filling in the form normally.
export interface BotCheckInput {
  /** Value of a hidden field real users never see or fill. Simple bots
   *  that auto-fill every input in a form will fill this too. */
  honeypot?: unknown;
  /** Client-side timestamp (Date.now()) captured when the form first
   *  rendered, sent back unchanged at submit time. */
  formRenderedAt?: unknown;
}

// A real person needs at least this long to read the form and type into
// it. A request arriving faster than this is almost certainly a script
// that POSTs straight to the API without ever rendering the page.
const MIN_HUMAN_FILL_TIME_MS = 2500;

// A request claiming to be older than this is more likely a stale/replayed
// or forged timestamp than a slow, genuine human — treat it the same as
// "too fast" rather than trusting it blindly.
const MAX_PLAUSIBLE_FILL_TIME_MS = 60 * 60_000;

export function isLikelyBot(input: BotCheckInput): boolean {
  if (typeof input.honeypot === "string" && input.honeypot.trim().length > 0) {
    return true;
  }

  const renderedAt = Number(input.formRenderedAt);
  if (!Number.isFinite(renderedAt) || renderedAt <= 0) {
    // Missing/malformed timestamp — client isn't the real form (or is an
    // old cached version) rather than proof of anything; treat as
    // suspicious the same as failing the timing check.
    return true;
  }

  const elapsed = Date.now() - renderedAt;
  return elapsed < MIN_HUMAN_FILL_TIME_MS || elapsed > MAX_PLAUSIBLE_FILL_TIME_MS;
}
