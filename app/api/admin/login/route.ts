import { NextResponse } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { verifyAdminPassword, createAdminSessionToken, ADMIN_SESSION_COOKIE, ADMIN_SESSION_MAX_AGE_SECONDS } from "@/lib/adminAuth";
import { logSecurityEvent } from "@/lib/securityLog";

export async function POST(req: Request) {
  const ip = getClientIp(req);

  // Strict brute-force guard for the password form itself: 5 attempts per
  // 15 minutes per IP, then a temporary lockout — the 6th attempt is refused
  // with a 429 before the password is even checked. (Every attempt counts,
  // right or wrong, so a bot can't probe for free.) bcrypt's cost factor
  // makes each guess expensive on top of this.
  const login = await rateLimit(`admin-login:${ip}`, 5, 15 * 60_000);
  if (!login.success) {
    logSecurityEvent("admin_login_locked_out", { ip });
    return NextResponse.json(
      { error: "Too many login attempts. Please wait 15 minutes and try again." },
      { status: 429, headers: { "Retry-After": String(15 * 60), "Cache-Control": "no-store" } }
    );
  }

  // Plus the general admin bucket (shared with requireAdmin) as a coarse
  // ceiling across every admin endpoint.
  const { success } = await rateLimit(`admin-auth:${ip}`, 20, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Too many attempts. Please wait a minute and try again." }, { status: 429 });
  }

  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const password = typeof body.password === "string" ? body.password.slice(0, 200) : "";
  const ok = await verifyAdminPassword(password);
  if (!ok) {
    logSecurityEvent("admin_login_failed", { ip });
    return NextResponse.json({ error: "Incorrect admin password." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  let token: string;
  try {
    token = createAdminSessionToken();
  } catch (err) {
    console.error("Admin login error:", err);
    return NextResponse.json(
      { error: "Server isn't configured for admin sessions — set ADMIN_SESSION_SECRET to a random string of 32+ characters." },
      { status: 500 }
    );
  }

  logSecurityEvent("admin_login_succeeded", { ip });
  const res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  // httpOnly: never readable/writable from page JavaScript — nothing to
  // steal via XSS and nothing stored in localStorage. secure: only sent
  // over HTTPS in production. sameSite=strict: never attached to any
  // cross-site request at all (the admin panel is a same-site app that
  // talks to its own API, so nothing legitimate needs it cross-site) —
  // the strongest CSRF guard the cookie itself can provide.
  res.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  });
  return res;
}
