import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { readCookiesWithPrefix } from "@/lib/cookies";
import { REVIEW_COOKIE_PREFIX, verifyEditToken } from "@/lib/reviewAuth";

const MAX_IDS = 50;

// Tells the page which reviews *this browser* may edit or delete, so the UI
// can show its "Your review · Edit · Delete" controls. The edit tokens live
// in httpOnly cookies that page JavaScript can't read (that's the whole
// point — no token in localStorage for an XSS bug to steal), so the browser
// can't work this out by itself. This route reads those cookies server-side,
// checks each one against the stored hash, and returns only the review ids
// that verify — never a token.
export async function GET(req: Request) {
  const noStore = { "Cache-Control": "private, no-store" };

  const ip = getClientIp(req);
  const { success } = await rateLimit(`reviews-mine:${ip}`, 60, 60_000);
  if (!success) {
    return NextResponse.json({ ids: [] }, { status: 429, headers: noStore });
  }

  const tokensById = readCookiesWithPrefix(req, REVIEW_COOKIE_PREFIX);
  const candidateIds = Object.keys(tokensById).slice(0, MAX_IDS);
  if (candidateIds.length === 0) {
    return NextResponse.json({ ids: [] }, { headers: noStore });
  }

  try {
    const rows = await prisma.review.findMany({
      where: { id: { in: candidateIds } },
      select: { id: true, editTokenHash: true },
    });
    const ids = rows
      .filter((r: { id: string; editTokenHash: string | null }) => verifyEditToken(tokensById[r.id], r.editTokenHash))
      .map((r: { id: string }) => r.id);
    return NextResponse.json({ ids }, { headers: noStore });
  } catch (err) {
    console.error("Reviews mine error:", err);
    return NextResponse.json({ ids: [] }, { headers: noStore });
  }
}
