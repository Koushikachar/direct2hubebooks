import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { verifyEditToken, reviewCookieName, reviewCookieOptions } from "@/lib/reviewAuth";
import { requireAdmin, ADMIN_SESSION_COOKIE } from "@/lib/adminAuth";
import { readCookie } from "@/lib/cookies";
import type { ReviewView } from "@/lib/types";

// Admin path: a valid admin session cookie. requireAdmin() also rate-limits,
// so it is only invoked when the request actually carries an admin cookie —
// an ordinary visitor deleting their own review never touches it.
async function isAdmin(req: Request): Promise<boolean> {
  if (!readCookie(req, ADMIN_SESSION_COOKIE)) return false;
  return (await requireAdmin(req)) === null;
}

// Owner path: the edit token lives in an httpOnly cookie the server set when
// the review was created — it is never accepted from the request body, so
// it never has to exist in page JavaScript at all.
async function authorize(req: Request, reviewId: string, reviewEditTokenHash: string | null) {
  if (await isAdmin(req)) return true;
  const token = readCookie(req, reviewCookieName(reviewId)) || "";
  return verifyEditToken(token, reviewEditTokenHash);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ip = getClientIp(req);
  const { success } = await rateLimit(`review-edit:${ip}`, 20, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const existing = await prisma.review.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Review not found." }, { status: 404 });

    const authorized = await authorize(req, id, existing.editTokenHash);
    if (!authorized) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const data: { name?: string; rating?: number; comment?: string } = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim().slice(0, 60);
      if (!name || name.length < 2) return NextResponse.json({ error: "Please enter a name." }, { status: 400 });
      data.name = name;
    }
    if (body.rating !== undefined) {
      const rating = Number(body.rating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return NextResponse.json({ error: "Rating must be between 1 and 5." }, { status: 400 });
      }
      data.rating = rating;
    }
    if (body.comment !== undefined) {
      const comment = String(body.comment).trim().slice(0, 600);
      if (!comment || comment.length < 5) {
        return NextResponse.json({ error: "Review must be at least 5 characters." }, { status: 400 });
      }
      data.comment = comment;
    }

    const updated = await prisma.review.update({ where: { id }, data });
    const view: ReviewView = {
      id: updated.id,
      name: updated.name,
      rating: updated.rating,
      comment: updated.comment,
      createdAt: updated.createdAt.toISOString(),
    };
    return NextResponse.json({ ok: true, review: view }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("Review edit error:", err);
    return NextResponse.json({ error: "Could not update the review." }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ip = getClientIp(req);
  const { success } = await rateLimit(`review-delete:${ip}`, 20, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  }

  try {
    const existing = await prisma.review.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Review not found." }, { status: 404 });

    const authorized = await authorize(req, id, existing.editTokenHash);
    if (!authorized) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    await prisma.review.delete({ where: { id } });
    const res = NextResponse.json({ ok: true });
    // Drop this browser's now-useless edit cookie (no-op for admin deletes).
    res.cookies.set(reviewCookieName(id), "", reviewCookieOptions(0));
    return res;
  } catch (err) {
    console.error("Review delete error:", err);
    return NextResponse.json({ error: "Could not delete the review." }, { status: 500 });
  }
}
