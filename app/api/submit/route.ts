import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { generateAccessToken } from "@/lib/tokens";
import { isLikelyBot } from "@/lib/botProtection";
import { cleanSingleLine } from "@/lib/validators";
import { logSecurityEvent } from "@/lib/securityLog";

interface SubmitBody {
  name?: string;
  email?: string;
  countryCode?: string;
  whatsapp?: string;
  // Bot-protection fields — see lib/botProtection.ts. Never shown to real
  // visitors, so they're just absent/empty on a genuine submission.
  website?: string;
  formRenderedAt?: number;
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const { success } = await rateLimit(`submit:${ip}`, 5, 10 * 60_000); // 5 submissions / 10 min / IP
  if (!success) {
    logSecurityEvent("rate_limited", { scope: "submit", ip });
    return NextResponse.json({ error: "Too many requests. Please try again in a few minutes." }, { status: 429 });
  }
  // Site-wide ceiling as well: every new submission can trigger up to 3
  // reminder emails from YOUR Gmail account to an address the requester chose,
  // so a botnet spreading requests over many IPs must not be able to turn the
  // form into an email cannon (or get the sending account suspended).
  const global = await rateLimit("submit:global", 300, 60 * 60_000);
  if (!global.success) {
    logSecurityEvent("rate_limited", { scope: "submit-global", ip });
    return NextResponse.json({ error: "We're receiving a lot of requests right now. Please try again shortly." }, { status: 429 });
  }

  try {
    const body = (await req.json()) as SubmitBody;
    const { name, email, countryCode, whatsapp } = body;

    // Rejected the same way as any other invalid submission — no hint to
    // an automated caller that this was specifically a bot check versus
    // a validation failure.
    if (isLikelyBot({ honeypot: body.website, formRenderedAt: body.formRenderedAt })) {
      return NextResponse.json({ error: "Could not process your request. Please try again." }, { status: 400 });
    }

    if (!name?.trim() || !email?.trim() || !whatsapp?.trim() || !countryCode?.trim()) {
      return NextResponse.json({ error: "All fields are required." }, { status: 400 });
    }
    if (name.length > 100 || email.length > 150 || whatsapp.length > 20 || countryCode.length > 6) {
      return NextResponse.json({ error: "One of the fields is too long." }, { status: 400 });
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (!/^\d{4,15}$/.test(whatsapp)) {
      return NextResponse.json({ error: "Enter a valid WhatsApp number." }, { status: 400 });
    }
    // Only a dial code like "+91" — this value is stored, emailed and sent on
    // to the payment gateway, so it must not be free text.
    if (!/^\+\d{1,4}$/.test(countryCode.trim())) {
      return NextResponse.json({ error: "Enter a valid country code." }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    // Control characters (CR/LF …) are stripped: this name later appears in
    // email subjects/headers, CSV exports and logs.
    const cleanName = cleanSingleLine(name, 100);
    if (!cleanName) {
      return NextResponse.json({ error: "Enter your name." }, { status: 400 });
    }

    // Same email or same WhatsApp number can only claim the file once —
    // but only once PAID. If a previous attempt never completed payment,
    // let them pick up where they left off instead of being locked out.
    const existing = await prisma.submission.findFirst({
      where: {
        OR: [{ email: normalizedEmail }, { AND: [{ countryCode: countryCode.trim() }, { whatsapp }] }],
      },
    });

    if (existing) {
      if (existing.paymentStatus === "paid") {
        return NextResponse.json(
          { error: "This email or WhatsApp number has already been used to get this file. Each person can only request it once." },
          { status: 409 }
        );
      }
      // Resume an unfinished checkout — but ONLY the id goes back. This
      // record was matched by email OR phone number, so echoing its stored
      // name/email/phone would let anyone read a stranger's details just by
      // typing their email address or number into the form.
      return NextResponse.json({ ok: true, submissionId: existing.id });
    }

    // Token is created now but doesn't unlock anything yet — the access
    // page checks paymentStatus and only reveals the download once paid.
    const accessToken = generateAccessToken();

    const submission = await prisma.submission.create({
      data: { name: cleanName, email: normalizedEmail, countryCode: countryCode.trim(), whatsapp, accessToken },
    });

    return NextResponse.json({ ok: true, submissionId: submission.id });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: "This email or WhatsApp number has already been used to get this file. Each person can only request it once." },
        { status: 409 }
      );
    }
    console.error("Submit error:", err);
    return NextResponse.json({ error: "Could not process your request. Please try again." }, { status: 500 });
  }
}
