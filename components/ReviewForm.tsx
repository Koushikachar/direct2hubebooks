"use client";
import { useCallback, useState, type FormEvent } from "react";
import { FaStar } from "react-icons/fa";
import type { ReviewView } from "@/lib/types";

const STAR_VALUES = [1, 2, 3, 4, 5] as const;

// Loaded on demand (see Reviews.tsx) — the form only matters once someone
// clicks "Write a review", so its code isn't part of the initial bundle.
export default function ReviewForm({ onSubmitted }: { onSubmitted: (review: ReviewView) => void }) {
  const [name, setName] = useState("");
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setStatus("loading");
      setError("");
      try {
        const res = await fetch("/api/reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, rating, comment, website: "" }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Couldn't submit your review.");
        onSubmitted(data.review);
        setName("");
        setRating(5);
        setComment("");
        setStatus("idle");
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Couldn't submit your review.");
      }
    },
    [comment, name, onSubmitted, rating]
  );

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-4 rounded-xl border border-brick-700/10 bg-cream/60 p-4 dark:bg-white/5 sm:p-5">
      <div>
        <span className="mb-1 block text-xs font-medium text-brick-700/80">Your rating</span>
        <div className="flex gap-1">
          {STAR_VALUES.map((i) => (
            <button
              type="button"
              key={i}
              onClick={() => setRating(i)}
              onMouseEnter={() => setHoverRating(i)}
              onMouseLeave={() => setHoverRating(0)}
              aria-label={`${i} star${i > 1 ? "s" : ""}`}
              className="text-ember-500"
            >
              <FaStar size={22} className={i <= (hoverRating || rating) ? "" : "text-brick-700/15"} />
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="review-name" className="mb-1 block text-xs font-medium text-brick-700/80">
          Name
        </label>
        <input
          id="review-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder="Your name"
          className="w-full rounded-lg border border-brick-700/20 bg-white px-3 py-2.5 text-sm text-[#2B0F08] placeholder:text-[#2B0F08]/40 outline-none ring-ember-500/40 focus:ring-2"
        />
      </div>

      <div>
        <label htmlFor="review-comment" className="mb-1 block text-xs font-medium text-brick-700/80">
          Review
        </label>
        <textarea
          id="review-comment"
          required
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={600}
          rows={3}
          placeholder="What did you think?"
          className="w-full rounded-lg border border-brick-700/20 bg-white px-3 py-2.5 text-sm text-[#2B0F08] placeholder:text-[#2B0F08]/40 outline-none ring-ember-500/40 focus:ring-2"
        />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        disabled={status === "loading"}
        className="rounded-lg bg-ember-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ember-500 disabled:opacity-60"
      >
        {status === "loading" ? "Submitting…" : "Submit review"}
      </button>

      <p className="text-xs text-brick-700/50">
        You&apos;ll be able to edit or delete this review later from this browser.
      </p>
    </form>
  );
}
