import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendMail, paymentReminderEmail } from "@/lib/mailer";
import { getSiteUrl } from "@/lib/siteUrl";
import { timingSafeEqual } from "@/lib/adminAuth";
import { getProduct } from "@/lib/product";
import { logSecurityEvent } from "@/lib/securityLog";
import { getClientIp } from "@/lib/rateLimit";

// "Filled the form, never paid" reminders — exactly 3, at fixed offsets
// from the moment the form was submitted (Submission.createdAt):
//   reminderCount 0 -> 10 minutes
//   reminderCount 1 -> 1 hour
//   reminderCount 2 -> 24 hours
// After the 3rd email, reminderCount is 3 and the submission is never
// considered again (see the `lt: 3` filter below) — no 4th email, ever.
const THRESHOLDS_MS = [10 * 60_000, 60 * 60_000, 24 * 60 * 60_000] as const;

// How many candidates to process per invocation — keeps a single cron run
// fast and bounded even if a burst of people abandon checkout at once.
// The cron is expected to run every few minutes, so anything left over
// gets picked up on the next run.
const BATCH_LIMIT = 200;

function isAuthorized(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically
  // when CRON_SECRET is set in the project's env vars. Also accept a
  // plain `x-cron-secret` header so any other scheduler (GitHub Actions,
  // cron-job.org, etc.) can call this the same way.
  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const provided = bearer || req.headers.get("x-cron-secret") || "";
  if (!provided) return false;
  return timingSafeEqual(provided, cronSecret);
}

async function run(req: Request) {
  if (!isAuthorized(req)) {
    logSecurityEvent("cron_unauthorized", { ip: getClientIp(req) });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();

  const candidates = await prisma.submission.findMany({
    where: { paymentStatus: "pending", reminderCount: { lt: 3 } },
    orderBy: { createdAt: "asc" },
    take: BATCH_LIMIT,
  });

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, sent: 0 });
  }

  const product = await getProduct();
  const checkoutUrl = `${getSiteUrl()}/price`;

  let sent = 0;
  const errors: string[] = [];

  for (const submission of candidates) {
    const stage = submission.reminderCount as 0 | 1 | 2;
    const threshold = THRESHOLDS_MS[stage];
    const elapsed = now - submission.createdAt.getTime();
    if (elapsed < threshold) continue; // not due yet

    const { subject, html } = paymentReminderEmail({
      name: submission.name,
      checkoutUrl,
      stage,
      logoUrl: product.logoUrl,
    });

    const delivered = await sendMail({ to: submission.email, subject, html });
    if (!delivered) {
      errors.push(submission.id);
      continue; // leave reminderCount alone — retried on the next cron run
    }

    // Atomic conditional update: only bump the count if it's still what
    // we read it as, so two overlapping cron runs can never double-send
    // the same reminder to the same person.
    const updated = await prisma.submission.updateMany({
      where: { id: submission.id, reminderCount: submission.reminderCount, paymentStatus: "pending" },
      data: { reminderCount: { increment: 1 }, lastReminderAt: new Date() },
    });
    if (updated.count > 0) sent += 1;
  }

  return NextResponse.json({ ok: true, checked: candidates.length, sent, failed: errors.length });
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}

export const dynamic = "force-dynamic";
