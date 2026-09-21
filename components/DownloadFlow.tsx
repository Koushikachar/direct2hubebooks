"use client";
import { useEffect, useRef, useState } from "react";
import { FaWhatsapp } from "react-icons/fa";
import DownloadButton from "./DownloadButton";
import WhatsAppJoinCard from "./WhatsAppJoinCard";

interface DownloadFlowProps {
  token: string;
  initialRemaining: number;
  /** Empty/undefined → the WhatsApp step is skipped entirely. */
  whatsappGroupUrl?: string;
  /** Server-resolved: this purchase has already been downloaded at least once. */
  initiallyDownloaded: boolean;
  /** Server-resolved from the httpOnly "joined" cookie. */
  initiallyJoined: boolean;
}

// Delay between the file starting to download and the WhatsApp card sliding
// in, so the buyer first sees "Downloaded ✓" and only then the next step.
const REVEAL_DELAY_MS = 1100;

/**
 * Step 1: download the PDF. Step 2 (after the download): join the WhatsApp
 * group. The file is never blocked behind the group any more.
 */
export default function DownloadFlow({
  token,
  initialRemaining,
  whatsappGroupUrl,
  initiallyDownloaded,
  initiallyJoined,
}: DownloadFlowProps) {
  const [showJoinCard, setShowJoinCard] = useState(initiallyDownloaded);
  const justDownloaded = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function handleDownloaded() {
    if (!whatsappGroupUrl || showJoinCard) return;
    justDownloaded.current = true;
    timer.current = window.setTimeout(() => setShowJoinCard(true), REVEAL_DELAY_MS);
  }

  // Bring the freshly revealed card into view (matters on phones, where the
  // download button and the card can be on different screens).
  useEffect(() => {
    if (!showJoinCard || !justDownloaded.current) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    cardRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
  }, [showJoinCard]);

  return (
    <div className="space-y-4">
      <DownloadButton token={token} initialRemaining={initialRemaining} onDownloaded={handleDownloaded} />

      {whatsappGroupUrl && !showJoinCard && !initiallyJoined && (
        <p className="flex items-center justify-center gap-1.5 text-xs text-brick-700/70 dark:text-cream/55">
          <FaWhatsapp className="h-3.5 w-3.5 text-[#25D366]" /> Next: join our WhatsApp community for bonus resources
        </p>
      )}

      {whatsappGroupUrl && showJoinCard && (
        <div ref={cardRef} aria-live="polite">
          <WhatsAppJoinCard whatsappGroupUrl={whatsappGroupUrl} token={token} initiallyJoined={initiallyJoined} />
        </div>
      )}
    </div>
  );
}
