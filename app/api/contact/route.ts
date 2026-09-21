import { NextResponse } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { sendMail, contactNotificationEmail, contactAutoReplyEmail } from "@/lib/mailer";
import { isLikelyBot } from "@/lib/botProtection";
import { cleanSingleLine } from "@/lib/validators";

interface ContactBody {
  name?: string;
  email?: string;
  message?: string;
  // Bot-protection fields — see lib/botProtection.ts.
  website?: string;
  formRenderedAt?: number;
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const { success } = await rateLimit(`contact:${ip}`, 5, 10 * 60_000); // 5 messages / 10 min / IP
  if (!success) {
    return NextResponse.json({ error: "Too many requests. Please try again in a few minutes." }, { status: 429 });
  }

  try {
    const body = (await req.json()) as ContactBody;
    const { name, email, message } = body;

    if (isLikelyBot({ honeypot: body.website, formRenderedAt: body.formRenderedAt })) {
      return NextResponse.json({ error: "Could not send your message. Please try again." }, { status: 400 });
    }

    if (!name?.trim() || !email?.trim() || !message?.trim()) {
      return NextResponse.json({ error: "All fields are required." }, { status: 400 });
    }
    if (name.length > 100 || email.length > 150 || message.length > 3000) {
      return NextResponse.json({ error: "One of the fields is too long." }, { status: 400 });
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const cleanName = cleanSingleLine(name, 100);
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanName) {
      return NextResponse.json({ error: "All fields are required." }, { status: 400 });
    }
    const cleanMessage = message.trim().slice(0, 3000);

    // Abuse guards. The auto-reply below goes to whatever address the
    // requester typed, from your own Gmail account — so cap how many can go
    // out overall, and how many to any single recipient, or this form could
    // be used to spam a third party (and get your sending account blocked).
    const globalCap = await rateLimit("contact:global", 200, 60 * 60_000);
    const recipientCap = await rateLimit(`contact-reply:${cleanEmail}`, 2, 24 * 60 * 60_000);
    if (!globalCap.success || !recipientCap.success) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    const adminEmail = process.env.GMAIL_USER;
    if (adminEmail) {
      await sendMail({
        to: adminEmail,
        subject: `New contact message from ${cleanName}`,
        html: contactNotificationEmail({ name: cleanName, email: cleanEmail, message: cleanMessage }),
        replyTo: cleanEmail,
      });
      await sendMail({
        to: cleanEmail,
        subject: "We got your message — Direct2hub",
        html: contactAutoReplyEmail({ name: cleanName }),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Contact form error:", err);
    return NextResponse.json({ error: "Could not send your message. Please try again." }, { status: 500 });
  }
}
