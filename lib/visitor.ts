// Anonymous visitor identity for the "unique visitors" admin metric.
//
// No IP address, no fingerprinting, no PII — just a random id in a
// first-party cookie, exactly like a "have you been here before" flag.
// That's also what keeps this out of GDPR/consent-banner territory: it
// carries no personal data and is only ever compared to itself.

import { readCookie } from "@/lib/cookies";
import { isUuid } from "@/lib/validators";

export const VISITOR_COOKIE = "d2h_vid";
const MAX_AGE_SECONDS = 400 * 24 * 60 * 60; // 400 days — Chrome's own cap on cookie lifetime

/** Reads the visitor id out of a request's Cookie header, if present AND
 *  well-formed. The cookie is attacker-controlled, so anything that isn't a
 *  UUID (oversized values, malformed %-escapes, junk meant to pollute the
 *  visitor table) is ignored and a fresh id is issued instead. */
export function readVisitorId(req: Request): string | null {
  const value = readCookie(req, VISITOR_COOKIE);
  return value && isUuid(value) ? value : null;
}

export function newVisitorId(): string {
  return crypto.randomUUID();
}

/** Cookie attributes for setting the visitor id — httpOnly-equivalent
 * isn't meaningful here since the value is meaningless without the
 * database, but Secure + SameSite=Lax + a long, capped lifetime keeps it
 * first-party-only and out of reach of any cross-site page. */
export const VISITOR_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};

// India Standard Time is a fixed UTC+5:30 all year (no DST). Kept in sync
// with the same bucketing the analytics route uses, so a visit recorded
// here always lands in the same day/week/month bucket the dashboard shows.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function istDayKey(d: Date = new Date()): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}
