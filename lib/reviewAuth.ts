import crypto from "crypto";

// A reviewer gets a random token back exactly once, right after they submit
// a review. Only its SHA-256 hash is stored, so editing/deleting later
// requires possessing that original token — nobody else, including someone
// reading the database directly, can derive it back from the hash.
//
// The token itself never reaches page JavaScript: the server hands it to the
// browser as an httpOnly cookie scoped to /api/reviews (see
// reviewCookieName below), so an XSS bug can't read it the way it could
// from localStorage. The browser just attaches it automatically when the
// reviewer later edits or deletes their own review.

export function generateEditToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export function hashEditToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function verifyEditToken(token: string, hash: string | null): boolean {
  if (!token || !hash) return false;
  const a = Buffer.from(hashEditToken(token));
  const b = Buffer.from(hash);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// One httpOnly cookie per review, e.g. `d2h_rt_<reviewId>` = <editToken>.
// Scoped to /api/reviews so it is never sent to any other route, and
// SameSite=Strict so it is never attached to a cross-site request.
export const REVIEW_COOKIE_PREFIX = "d2h_rt_";
export const REVIEW_COOKIE_PATH = "/api/reviews";
export const REVIEW_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function reviewCookieName(reviewId: string): string {
  return `${REVIEW_COOKIE_PREFIX}${reviewId}`;
}

export function reviewCookieOptions(maxAge = REVIEW_COOKIE_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: REVIEW_COOKIE_PATH,
    maxAge,
  };
}
