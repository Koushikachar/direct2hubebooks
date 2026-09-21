import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { downloadObject, resolveStorageKey, SUPABASE_PDF_BUCKET } from "@/lib/storage";
import { slugifyFilename, deviceCookieName } from "@/lib/tokens";
import { logSecurityEvent } from "@/lib/securityLog";

const MAX_DOWNLOADS = 3;

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const { success } = await rateLimit(`download:${ip}`, 30, 60_000); // 30/min/IP
  if (!success) {
    return NextResponse.json({ error: "Too many requests. Please slow down and try again." }, { status: 429 });
  }

  try {
    const body = await req.json();
    const { token } = body as { token?: string };
    if (!token || typeof token !== "string" || token.length > 100) {
      return NextResponse.json({ error: "Missing token." }, { status: 400 });
    }

    const submission = await prisma.submission.findUnique({ where: { accessToken: token } });
    if (!submission) return NextResponse.json({ error: "Invalid link." }, { status: 404 });

    if (submission.paymentStatus !== "paid") {
      return NextResponse.json({ error: "Payment not completed for this link." }, { status: 403 });
    }

    // The access page claims the link for a browser (setting its device
    // cookie) BEFORE it ever shows the download button, so a genuine buyer
    // always has a matching cookie. Requiring it unconditionally — even when
    // no device has claimed the link yet — means the API can never be hit
    // directly with just a token (a leaked/forwarded link, a script) to pull
    // the file without going through the page's device limit.
    {
      const cookieStore = await cookies();
      const deviceCookie = cookieStore.get(deviceCookieName(submission.id))?.value;
      if (!deviceCookie || !submission.deviceTokens.includes(deviceCookie)) {
        logSecurityEvent("download_device_denied", { ip, submissionId: submission.id });
        return NextResponse.json(
          { error: "Please open your download link in the browser first — this device hasn't been verified yet." },
          { status: 403 }
        );
      }
    }

    if (submission.downloadCount >= MAX_DOWNLOADS) {
      return NextResponse.json(
        { error: "You've reached the maximum download limit. You can't download this file anymore.", limitReached: true, remaining: 0 },
        { status: 403 }
      );
    }

    const product = await prisma.product.findFirst({ orderBy: { updatedAt: "desc" } });
    if (!product?.pdfUrl) {
      return NextResponse.json({ error: "The file isn't available yet. Please check back soon." }, { status: 404 });
    }

    // Atomic conditional update — guards against a burst of parallel
    // requests from the same link ever pushing the count past the limit.
    const updated = await prisma.submission.updateMany({
      where: { id: submission.id, downloadCount: { lt: MAX_DOWNLOADS } },
      data: { downloadCount: { increment: 1 } },
    });
    if (updated.count === 0) {
      return NextResponse.json(
        { error: "You've reached the maximum download limit. You can't download this file anymore.", limitReached: true, remaining: 0 },
        { status: 403 }
      );
    }

    const fresh = await prisma.submission.findUnique({ where: { id: submission.id } });
    const remaining = Math.max(0, MAX_DOWNLOADS - (fresh?.downloadCount ?? MAX_DOWNLOADS));

    // Fetch the file server-side (our Supabase S3 credentials, never
    // exposed to the browser) and stream the bytes straight back in this
    // response. We never hand the client a Supabase Storage URL — there's
    // no separate, permanent, shareable link to leak. The browser gets
    // the file from our own origin with Content-Disposition: attachment,
    // which is what makes it actually start downloading instead of
    // opening/navigating somewhere, and we control the filename it saves as.
    const key = resolveStorageKey(product.pdfUrl, SUPABASE_PDF_BUCKET);
    let buffer: Buffer;
    try {
      buffer = await downloadObject(SUPABASE_PDF_BUCKET, key);
    } catch (downloadError) {
      console.error("PDF fetch error:", downloadError instanceof Error ? downloadError.message : downloadError);
      // The download was already counted above (atomically, to stop parallel
      // requests racing past the limit). The buyer got nothing for it, so
      // give it back rather than burning one of their 3 downloads on our
      // storage hiccup.
      await prisma.submission
        .updateMany({ where: { id: submission.id, downloadCount: { gt: 0 } }, data: { downloadCount: { decrement: 1 } } })
        .catch(() => {});
      return NextResponse.json({ error: "The file couldn't be retrieved. Please try again shortly." }, { status: 502 });
    }

    const filename = slugifyFilename(product.title || "ebook");

    // Wrap the Buffer in a Uint8Array: it is a valid BodyInit for every
    // Next.js / @types/node version, whereas passing a Node Buffer directly
    // fails type-checking on newer typings ("Buffer is not assignable to
    // BodyInit") even though it happens to work at runtime.
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Remaining": String(remaining),
      },
    });
  } catch (err) {
    console.error("Download error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
