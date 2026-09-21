import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/adminAuth";
import { readCookie } from "@/lib/cookies";

// No rate limiting here — this only reads/verifies a cookie the server
// itself signed, it never checks a guessable secret, so there's nothing
// to brute-force. It's what the admin page calls on load (and only then)
// to decide whether to show the dashboard or the login form, instead of
// keeping that decision in React state that a refresh wipes out.
export async function GET(req: Request) {
  const token = readCookie(req, ADMIN_SESSION_COOKIE);
  return NextResponse.json(
    { authenticated: verifyAdminSessionToken(token) },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
