import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { isAllowedMediaUrl, isSafeHttpsUrl, isSafeStorageKey } from "@/lib/validators";
import { resolveStorageKey, SUPABASE_PDF_BUCKET } from "@/lib/storage";

// By the time a request reaches this route, every file has already been
// uploaded straight to Supabase Storage by the browser (see
// /api/admin/upload/sign) — this route only ever receives small JSON:
// text fields plus the resulting URLs. That's what keeps it under
// Vercel's ~4.5MB serverless request-body limit no matter how large the
// video or PDF is; previously the whole multipart file upload went
// through here and hit that platform limit (413 FUNCTION_PAYLOAD_TOO_LARGE)
// even for a 5MB image.
const TEXT_FIELDS = [
  "title",
  "tagline",
  "about",
  "learnFrom",
  "learnFromBio",
  "contactPhone",
  "whatsappUrl",
  "whatsappGroupUrl",
  "youtubeUrl",
  "instagramUrl",
] as const;

const MEDIA_URL_FIELDS = [
  "logoUrl",
  "heroImageUrl",
  "videoUrl",
  "previewImage1Url",
  "previewImage2Url",
  "previewImage3Url",
] as const;

// Fields that become <a href> links for every visitor — https only, so a
// `javascript:` or `data:` URL can never be planted as a stored-XSS link.
const LINK_FIELDS = ["whatsappUrl", "whatsappGroupUrl", "youtubeUrl", "instagramUrl"] as const;

// Server-side length caps (the form's own limits are only a convenience).
const MAX_LENGTH: Record<(typeof TEXT_FIELDS)[number], number> = {
  title: 200,
  tagline: 300,
  about: 6000,
  learnFrom: 120,
  learnFromBio: 400,
  contactPhone: 30,
  whatsappUrl: 300,
  whatsappGroupUrl: 300,
  youtubeUrl: 300,
  instagramUrl: 300,
};

export async function POST(req: Request) {
  const authError = await requireAdmin(req);
  if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status });

  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const fields: Record<string, string | number> = {};

    const bad = (message: string) => NextResponse.json({ error: message }, { status: 400 });

    for (const key of TEXT_FIELDS) {
      const value = body[key];
      if (typeof value !== "string" || value.length === 0) continue;
      if (value.length > MAX_LENGTH[key]) return bad(`"${key}" is too long (max ${MAX_LENGTH[key]} characters).`);
      fields[key] = value;
    }
    for (const key of LINK_FIELDS) {
      const value = body[key];
      if (typeof value === "string" && value.length > 0 && !isSafeHttpsUrl(value, 300)) {
        return bad(`"${key}" must be a full https:// link.`);
      }
    }
    if (typeof body.contactPhone === "string" && body.contactPhone && !/^[+\d\s()-]{3,30}$/.test(body.contactPhone)) {
      return bad('"contactPhone" may only contain digits, spaces, + ( ) and -.');
    }
    for (const key of MEDIA_URL_FIELDS) {
      const value = body[key];
      if (typeof value !== "string" || value.length === 0) continue;
      if (!isAllowedMediaUrl(value)) {
        return bad(`"${key}" must be a file uploaded here (or a /path on this site) — other addresses aren't allowed.`);
      }
      fields[key] = value;
    }
    // The paid ebook: only a storage key created by /api/admin/upload/sign
    // (or an existing URL of this project's own private bucket) — never an
    // arbitrary path/URL that /api/download would then try to fetch.
    if (typeof body.pdfUrl === "string" && body.pdfUrl.length > 0) {
      const key = resolveStorageKey(body.pdfUrl, SUPABASE_PDF_BUCKET);
      if (!isSafeStorageKey(key)) return bad('"pdfUrl" must be a file uploaded through the admin panel.');
      fields.pdfUrl = body.pdfUrl;
    }
    if (typeof body.pdfSizeKb === "number" && body.pdfSizeKb > 0 && body.pdfSizeKb < 200_000) {
      fields.pdfSizeKb = Math.round(body.pdfSizeKb);
    }

    const existing = await prisma.product.findFirst();
    const product = existing
      ? await prisma.product.update({ where: { id: existing.id }, data: fields })
      : await prisma.product.create({ data: fields });

    return NextResponse.json({ ok: true, product });
  } catch (err) {
    console.error("Admin upload error:", err);
    const message = err instanceof Error ? err.message : "";

    let hint = "Save failed. Check the server logs for details.";
    if (/does not exist|relation .* not found|P2021|P1001/i.test(message)) {
      hint = "Database isn't set up yet — run `npx prisma db push` against your DATABASE_URL, or double-check DATABASE_URL/DIRECT_URL are set.";
    }

    return NextResponse.json({ error: hint }, { status: 500 });
  }
}
