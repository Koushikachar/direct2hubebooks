"use client";
import { useEffect, useState } from "react";
import { FaWhatsapp, FaBell, FaGift, FaHeadset } from "react-icons/fa";

interface WhatsAppJoinCardProps {
  /** Admin-configured group invite link (Product.whatsappGroupUrl). */
  whatsappGroupUrl: string;
  /** The purchase's access token — sent to the server so it can remember
   *  (in an httpOnly cookie) that this buyer already joined. */
  token: string;
  /** Resolved on the server from that cookie, so a returning buyer who has
   *  already joined sees the compact "you're in" state, not the invite. */
  initiallyJoined?: boolean;
}

const PERKS = [
  { icon: FaBell, label: "Launch updates" },
  { icon: FaGift, label: "Bonus resources" },
  { icon: FaHeadset, label: "Direct support" },
] as const;

const CONFETTI_COLORS = ["#25D366", "#FF6600", "#FFC299", "#FFD166", "#34B7F1"];

// Deterministic (no Math.random) so server and client always agree.
const CONFETTI = Array.from({ length: 20 }, (_, i) => {
  const angle = (i / 20) * Math.PI * 2;
  const distance = 64 + (i % 3) * 26;
  return {
    dx: `${Math.round(Math.cos(angle) * distance)}px`,
    dy: `${Math.round(Math.sin(angle) * distance - 18)}px`,
    rot: `${(i * 53) % 360}deg`,
    delay: `${(i % 6) * 35}ms`,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  };
});

function Confetti() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {CONFETTI.map((c, i) => (
        <span
          key={i}
          className="wa-confetti-piece"
          style={
            {
              "--dx": c.dx,
              "--dy": c.dy,
              "--rot": c.rot,
              "--delay": c.delay,
              background: c.color,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

function AnimatedCheck({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path className="wa-check-path" d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/**
 * Shown AFTER the buyer has downloaded the PDF (see DownloadFlow). It invites
 * them into the WhatsApp community — it never blocks the file.
 */
export default function WhatsAppJoinCard({ whatsappGroupUrl, token, initiallyJoined = false }: WhatsAppJoinCardProps) {
  const [joined, setJoined] = useState(initiallyJoined);
  const [opened, setOpened] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    if (!celebrate) return;
    const t = window.setTimeout(() => setCelebrate(false), 1800);
    return () => window.clearTimeout(t);
  }, [celebrate]);

  function confirmJoined() {
    // Celebrate immediately; persisting is best-effort (httpOnly cookie).
    setJoined(true);
    setCelebrate(true);
    fetch("/api/access/joined", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      keepalive: true,
    }).catch(() => {
      // ignore — worst case the invite shows again next visit
    });
  }

  if (joined) {
    return (
      <div
        role="status"
        className="wa-card-in relative overflow-hidden rounded-2xl border border-[#25D366]/30 bg-[#25D366]/10 px-4 py-5 text-center"
      >
        {celebrate && <Confetti />}
        <div className="wa-pop mx-auto mb-2 grid h-11 w-11 place-items-center rounded-full bg-[#25D366] text-white shadow-lg shadow-[#25D366]/30">
          <AnimatedCheck className="h-6 w-6" />
        </div>
        <p className="font-display text-base font-bold">You&apos;re in the community!</p>
        <p className="mt-0.5 text-xs text-brick-700/75 dark:text-cream/65">
          Keep an eye on the group for updates and bonus resources.
        </p>
        <a
          href={whatsappGroupUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[#128C7E] underline underline-offset-2 hover:text-[#25D366] dark:text-[#25D366]"
        >
          <FaWhatsapp className="h-3.5 w-3.5" /> Open the WhatsApp group
        </a>
      </div>
    );
  }

  return (
    // Animated gradient hairline border around the card.
    <div className="wa-card-in wa-border rounded-[1.25rem] p-[1.5px] shadow-xl shadow-[#25D366]/15" role="region" aria-label="Join our WhatsApp group">
      <div className="relative space-y-4 overflow-hidden rounded-[1.15rem] bg-white px-5 py-6 text-center dark:bg-[#1b100c]">
        {/* soft glow blobs */}
        <div aria-hidden className="pointer-events-none absolute -left-10 -top-10 h-32 w-32 rounded-full bg-[#25D366]/15 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-10 -right-10 h-32 w-32 rounded-full bg-ember-600/10 blur-2xl" />

        <div className="relative mx-auto grid h-16 w-16 place-items-center">
          <span aria-hidden className="wa-ripple absolute inset-0 rounded-full bg-[#25D366]/40" />
          <span aria-hidden className="wa-ripple absolute inset-0 rounded-full bg-[#25D366]/40" style={{ animationDelay: "1.2s" }} />
          <span className="wa-bob relative grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-[#25D366] to-[#128C7E] text-white shadow-lg shadow-[#25D366]/40">
            <FaWhatsapp className="h-8 w-8" />
          </span>
        </div>

        <div className="relative space-y-1.5">
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#128C7E] dark:text-[#25D366]">
            Your download has started
          </p>
          <h3 className="font-display text-lg font-extrabold leading-snug">Now join our WhatsApp community</h3>
          <p className="text-sm text-brick-700/75 dark:text-cream/65">
            Get updates, bonus resources and direct support from the team — all in one place.
          </p>
        </div>

        <ul className="relative flex flex-wrap items-center justify-center gap-2">
          {PERKS.map(({ icon: Icon, label }, i) => (
            <li
              key={label}
              className="wa-chip-in inline-flex items-center gap-1.5 rounded-full border border-[#25D366]/25 bg-[#25D366]/10 px-3 py-1 text-xs font-semibold text-[#0f7a55] dark:text-[#7ff0b0]"
              style={{ animationDelay: `${350 + i * 120}ms` }}
            >
              <Icon className="h-3 w-3" /> {label}
            </li>
          ))}
        </ul>

        <a
          href={whatsappGroupUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setOpened(true)}
          className="wa-shine relative flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-[#25D366] py-3.5 font-semibold text-white shadow-lg shadow-[#25D366]/30 transition hover:-translate-y-0.5 hover:bg-[#1fbd5b] active:translate-y-0"
        >
          <FaWhatsapp className="h-5 w-5" /> Join the WhatsApp group
        </a>

        <button
          type="button"
          onClick={confirmJoined}
          className={`relative flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition ${
            opened
              ? "bg-ember-600 text-white shadow-md shadow-ember-600/25 hover:bg-ember-500"
              : "bg-brick-700/10 text-brick-700/80 hover:bg-brick-700/15 dark:bg-white/5 dark:text-cream/70"
          }`}
        >
          <AnimatedCheck className="h-4 w-4" /> I&apos;ve joined the group
        </button>

        <p className="relative text-xs text-brick-700/50 dark:text-cream/40">Takes 10 seconds · You only need to do this once.</p>
      </div>
    </div>
  );
}
