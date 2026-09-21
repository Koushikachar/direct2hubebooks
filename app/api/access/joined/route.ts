import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { whatsappJoinedCookieName, WHATSAPP_JOINED_MAX_AGE_SECONDS } from "@/lib/tokens";

// Remembers, per purchase, that the buyer has clicked "I've joined — unlock
// my download" on the access page. This replaces the old localStorage flag:
// the server sets an httpOnly cookie, and the access page reads it on the
// server, so nothing about it lives in page-readable storage. (The gate is a
// friendly nudge, not a security boundary — the real protections on the
// file are the payment check, the device claim, and the download limit in
// /api/download.)
export async function POST(req: Request) {
  const ip = getClientIp(req);
  const { success } = await rateLimit(`access-joined:${ip}`, 20, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  }

  let token: unknown;
  try {
    ({ token } = (await req.json()) as { token?: unknown });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof token !== "string" || !token || token.length > 100) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  try {
    const submission = await prisma.submission.findUnique({
      where: { accessToken: token },
      select: { id: true, paymentStatus: true },
    });
    if (!submission || submission.paymentStatus !== "paid") {
      return NextResponse.json({ error: "Invalid link." }, { status: 404 });
    }

    const res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    res.cookies.set(whatsappJoinedCookieName(submission.id), "1", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      // Lax (not Strict) on purpose: buyers open this page from a link in
      // their email, which is a cross-site top-level navigation — Strict
      // would drop the cookie on exactly that first visit.
      sameSite: "lax",
      path: "/",
      maxAge: WHATSAPP_JOINED_MAX_AGE_SECONDS,
    });
    return res;
  } catch (err) {
    console.error("Access joined error:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
