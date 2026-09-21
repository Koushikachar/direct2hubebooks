import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const revalidate = 30;

function firstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] || "Someone";
  // Cap length so an unusually long single "name" field doesn't look odd.
  return first.length > 20 ? `${first.slice(0, 20)}…` : first;
}

// Only ever returns rows that really happened — first name and a rough
// relative time, nothing else identifying (no email, phone, or amount).
// If there's no recent real activity, it returns an empty list rather than
// inventing any — the widget that renders this simply shows nothing then.
export async function GET() {
  try {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const recent = await prisma.submission.findMany({
      where: { paymentStatus: "paid", paidAt: { gte: since } },
      select: { name: true, paidAt: true },
      orderBy: { paidAt: "desc" },
      take: 12,
    });

    return NextResponse.json(
      {
        ok: true,
        items: recent
          .filter((r: { paidAt: Date | null }) => r.paidAt)
          .map((r: { name: string; paidAt: Date | null }) => ({
            firstName: firstName(r.name),
            paidAt: r.paidAt!.toISOString(),
          })),
      },
      // Same for every visitor → let the CDN serve it for 30s (and keep
      // serving a stale copy while it refreshes) instead of hitting the
      // database on every page view.
      { headers: { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=120" } }
    );
  } catch (err) {
    console.error("recent-activity error:", err);
    return NextResponse.json({ ok: true, items: [] });
  }
}
