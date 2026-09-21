"use client";
import { useEffect, useState } from "react";

type Status = "idle" | "loading" | "done" | "blocked" | "error";

interface DownloadButtonProps {
  token: string;
  initialRemaining: number;
  /** Called once the PDF has been received and the browser save has been
   *  triggered — used to reveal the WhatsApp step after the download. */
  onDownloaded?: () => void;
}

function filenameFromDisposition(disposition: string | null): string {
  if (!disposition) return "ebook.pdf";
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  return match ? match[1] : "ebook.pdf";
}

export default function DownloadButton({ token, initialRemaining, onDownloaded }: DownloadButtonProps) {
  const [remaining, setRemaining] = useState(initialRemaining);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  // Show the "Downloaded" confirmation briefly, then go back to idle so the
  // button can be used again (up to the download limit).
  useEffect(() => {
    if (status !== "done") return;
    const t = window.setTimeout(() => setStatus("idle"), 2600);
    return () => window.clearTimeout(t);
  }, [status]);

  async function handleDownload() {
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const contentType = res.headers.get("content-type") || "";

      // A successful response is the PDF itself, not JSON — the file is
      // streamed straight from our server so it starts downloading
      // immediately instead of navigating to a separate link.
      if (!res.ok || !contentType.includes("application/pdf")) {
        const data = await res.json().catch(() => ({}));
        setStatus(data.limitReached ? "blocked" : "error");
        setMessage(data.error || "Something went wrong.");
        return;
      }

      const filename = filenameFromDisposition(res.headers.get("content-disposition"));
      const remainingHeader = res.headers.get("x-remaining");

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);

      setRemaining(remainingHeader ? Number(remainingHeader) : remaining - 1);
      setStatus("done");
      onDownloaded?.();
    } catch {
      setStatus("error");
      setMessage("Something went wrong. Please try again.");
    }
  }

  // The limit message replaces the button — but not while the "Downloaded"
  // confirmation of the final allowed download is still on screen.
  if (status === "blocked" || (remaining <= 0 && status !== "done")) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600 dark:bg-red-500/10 dark:text-red-300">
        You've reached the maximum download limit. You can't download this file anymore.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleDownload}
        disabled={status === "loading" || status === "done"}
        className={`flex w-full items-center justify-center gap-2 rounded-lg py-3 font-semibold text-white transition disabled:cursor-default ${
          status === "done" ? "bg-[#25D366] shadow-lg shadow-[#25D366]/25" : "bg-ember-600 hover:bg-ember-500 disabled:opacity-60"
        }`}
      >
        {status === "done" ? (
          <>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path className="wa-check-path" d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
            Downloaded
          </>
        ) : status === "loading" ? (
          "Preparing…"
        ) : (
          "Download the Ebook"
        )}
      </button>
      <p className="text-xs text-brick-700/80">{remaining} of 3 downloads remaining</p>
      {status === "error" && <p className="text-sm text-red-500">{message}</p>}
    </div>
  );
}
