import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { VISITOR_COOKIE, VISITOR_COOKIE_OPTIONS, readVisitorId, newVisitorId, istDayKey } from "@/lib/visitor";

// Fired once per page-load from <VisitorTracker /> (components/VisitorTracker.tsx).
// Deliberately fire-and-forget from the client: this must never be able to
// break or slow down a real page for a real visitor, so every failure path
// here still returns 200.
export async function POST(req: Request) {
  // Generous per-IP cap — this only guards against a script hammering the
  // endpoint to inflate the visitor count; a real person browsing the site
  // normally will never get near it.
  const ip = getClientIp(req);
  const { success } = await rateLimit(`track-visit:${ip}`, 120, 60_000);
  if (!success) return NextResponse.json({ ok: true }, { status: 200 });

  let path = "/";
  try {
    const body = await req.json();
    // Only a plain site path is stored — never arbitrary text.
    if (typeof body?.path === "string" && /^\/[A-Za-z0-9._~\-\/]{0,199}$/.test(body.path)) path = body.path;
  } catch {
    // No/invalid body — track with the default path rather than failing.
  }

  const existingId = readVisitorId(req);
  const visitorId = existingId || newVisitorId();
  const day = istDayKey();

  try {
    // Idempotent: the (visitorId, day) unique constraint means repeat
    // calls for the same browser on the same day are no-ops, not new rows.
    await prisma.visit.upsert({
      where: { visitorId_day: { visitorId, day } },
      create: { visitorId, day, path },
      update: {},
    });
  } catch (err) {
    console.error("track-visit error:", err);
    // Still set the cookie below so the visitor has a stable id for next time.
  }

  const res = NextResponse.json({ ok: true });
  if (!existingId) {
    res.cookies.set(VISITOR_COOKIE, visitorId, VISITOR_COOKIE_OPTIONS);
  }
  return res;
}
