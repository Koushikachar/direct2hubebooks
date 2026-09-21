"use client";
import { useCallback, useEffect, useMemo, useState, memo } from "react";
import dynamic from "next/dynamic";
import { FaStar } from "react-icons/fa";
import type { ReviewView, ReviewsSummary } from "@/lib/types";
import ScrollReveal from "./ScrollReveal";
import { ReviewSkeleton, Skeleton } from "./Skeleton";

// Code-split: the write-a-review form is only needed after a click.
const ReviewForm = dynamic(() => import("./ReviewForm"), {
  loading: () => <Skeleton className="mt-4 h-56 rounded-xl" />,
});

interface ReviewsProps {
  initialReviews: ReviewView[];
  initialSummary: ReviewsSummary;
  initialCursor: string | null;
}

const STAR_VALUES = [1, 2, 3, 4, 5] as const;
const BREAKDOWN_STARS = [5, 4, 3, 2, 1] as const;

// Renders the *actual* fractional average (4.7 shows a ~70%-filled 5th
// star) instead of rounding to the nearest whole star first. Rounding
// (the previous behaviour) made a 4.7 average render as 5 full stars —
// visually contradicting the "4.7" number printed right next to it.
const Stars = memo(function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <div className="flex gap-0.5 text-ember-500" aria-label={`${value} out of 5 stars`}>
      {STAR_VALUES.map((i) => {
        const fillPct = Math.max(0, Math.min(1, value - (i - 1))) * 100;
        return (
          <span key={i} className="relative inline-block leading-none" style={{ width: size, height: size }}>
            <FaStar size={size} className="absolute inset-0 text-brick-700/15" />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fillPct}%` }}>
              <FaStar size={size} />
            </span>
          </span>
        );
      })}
    </div>
  );
});

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase();
}

function timeAgo(iso: string): string {
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months > 1 ? "s" : ""} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years > 1 ? "s" : ""} ago`;
}

export default function Reviews({ initialReviews, initialSummary, initialCursor }: ReviewsProps) {
  const [reviews, setReviews] = useState(initialReviews);
  const [summary, setSummary] = useState(initialSummary);
  const [cursor, setCursor] = useState(initialCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  // Ids of the reviews this browser is allowed to edit/delete. The proof of
  // ownership is an httpOnly cookie the server set when the review was
  // written — page JavaScript can't read it (nothing in localStorage for an
  // injected script to steal), so the server tells us which ids verify.
  const [mine, setMine] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    let cancelled = false;
    fetch("/api/reviews/mine", { credentials: "same-origin", cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { ids: [] }))
      .then((data: { ids?: string[] }) => {
        if (!cancelled && Array.isArray(data.ids) && data.ids.length > 0) {
          setMine((prev) => new Set([...prev, ...data.ids!]));
        }
      })
      .catch(() => {
        // Not being able to tell which reviews are yours only hides the
        // edit/delete buttons — never worth surfacing an error for.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/reviews?cursor=${encodeURIComponent(cursor)}`);
      const data = await res.json();
      setReviews((prev) => [...prev, ...data.reviews]);
      setCursor(data.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore]);

  const handleSubmitted = useCallback((review: ReviewView) => {
    // The server has just set this review's edit cookie on the browser.
    setMine((prev) => new Set([...prev, review.id]));
    setReviews((prev) => [review, ...prev]);
    setSummary((prev) => {
      const count = prev.count + 1;
      const sum = prev.average * prev.count + review.rating;
      const key = Math.min(5, Math.max(1, Math.round(review.rating))) as 1 | 2 | 3 | 4 | 5;
      return {
        average: Math.round((sum / count) * 10) / 10,
        count,
        breakdown: { ...prev.breakdown, [key]: prev.breakdown[key] + 1 },
      };
    });
    setFormOpen(false);
  }, []);

  const handleUpdated = useCallback((updated: ReviewView, oldRating: number) => {
    setReviews((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    if (updated.rating !== oldRating) {
      setSummary((prev) => {
        const sum = prev.average * prev.count - oldRating + updated.rating;
        const oldKey = Math.min(5, Math.max(1, Math.round(oldRating))) as 1 | 2 | 3 | 4 | 5;
        const newKey = Math.min(5, Math.max(1, Math.round(updated.rating))) as 1 | 2 | 3 | 4 | 5;
        return {
          average: prev.count ? Math.round((sum / prev.count) * 10) / 10 : 0,
          count: prev.count,
          breakdown: {
            ...prev.breakdown,
            [oldKey]: Math.max(0, prev.breakdown[oldKey] - 1),
            [newKey]: prev.breakdown[newKey] + 1,
          },
        };
      });
    }
  }, []);

  const handleDeleted = useCallback((id: string, rating: number) => {
    setMine((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setReviews((prev) => prev.filter((r) => r.id !== id));
    setSummary((prev) => {
      const count = Math.max(0, prev.count - 1);
      const sum = prev.average * prev.count - rating;
      const key = Math.min(5, Math.max(1, Math.round(rating))) as 1 | 2 | 3 | 4 | 5;
      return {
        average: count ? Math.round((sum / count) * 10) / 10 : 0,
        count,
        breakdown: { ...prev.breakdown, [key]: Math.max(0, prev.breakdown[key] - 1) },
      };
    });
  }, []);

  const toggleForm = useCallback(() => setFormOpen((v) => !v), []);

  // Recomputed only when the summary actually changes, not on every render
  // (e.g. while typing in the review form or paginating).
  const breakdownRows = useMemo(
    () =>
      BREAKDOWN_STARS.map((star) => {
        const count = summary.breakdown[star] || 0;
        const pct = summary.count ? Math.round((count / summary.count) * 100) : 0;
        return { star, count, pct };
      }),
    [summary.breakdown, summary.count]
  );

  return (
    <section className="mt-10 sm:mt-12">
      <ScrollReveal allBreakpoints>
        <div className="card p-6 sm:p-8">
          <h2 className="font-display text-xl font-bold text-brick-950 sm:text-2xl">Customer reviews</h2>

          <div className="mt-6 grid grid-cols-1 gap-8 sm:grid-cols-[auto_1fr] sm:items-center">
            <div className="flex flex-col items-start gap-1 sm:items-center sm:border-r sm:border-brick-700/10 sm:pr-8">
              <span className="font-display text-4xl font-bold text-brick-950">{summary.average.toFixed(1)}</span>
              <Stars value={summary.average} size={16} />
              <span className="text-sm text-brick-700/80">{summary.count} reviews</span>
            </div>

            <div className="space-y-1.5">
              {breakdownRows.map(({ star, count, pct }) => (
                <div key={star} className="flex items-center gap-2 text-xs text-brick-700/80">
                  <span className="w-3">{star}</span>
                  <FaStar size={10} className="text-ember-500" />
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-brick-700/10">
                    <div className="h-full rounded-full bg-ember-500" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-8 text-right">{count}</span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={toggleForm}
            className="mt-6 rounded-lg border border-ember-600 px-4 py-2 text-sm font-semibold text-ember-600 transition hover:bg-ember-600/10"
          >
            {formOpen ? "Cancel" : "Write a review"}
          </button>

          {formOpen && <ReviewForm onSubmitted={handleSubmitted} />}

          <ul className="mt-8 space-y-6 divide-y divide-brick-700/10">
            {reviews.map((r, i) => (
              <ReviewItem
                key={r.id}
                review={r}
                index={i}
                isMine={mine.has(r.id)}
                onUpdated={handleUpdated}
                onDeleted={handleDeleted}
              />
            ))}
            {loadingMore && (
              <>
                <ReviewSkeleton />
                <ReviewSkeleton />
              </>
            )}
          </ul>

          {cursor && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="mt-6 w-full rounded-lg border border-brick-700/15 py-2.5 text-sm font-medium text-brick-800 transition hover:bg-brick-950/5 disabled:opacity-60"
            >
              {loadingMore ? "Loading…" : "Load more reviews"}
            </button>
          )}
        </div>
      </ScrollReveal>
    </section>
  );
}

interface ReviewItemProps {
  review: ReviewView;
  isMine?: boolean;
  onUpdated: (updated: ReviewView, oldRating: number) => void;
  onDeleted: (id: string, rating: number) => void;
  index?: number;
}

// Memoized: with potentially 100+ reviews loaded via "Load more", this
// keeps unrelated re-renders (typing in the write-a-review form, loading
// the next page) from re-rendering every existing <ReviewItem>.
const ReviewItem = memo(function ReviewItem({
  review,
  isMine = false,
  onUpdated,
  onDeleted,
  index = 0,
}: ReviewItemProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(review.name);
  const [rating, setRating] = useState(review.rating);
  const [comment, setComment] = useState(review.comment);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

  const handleSave = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const res = await fetch(`/api/reviews/${review.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, rating, comment }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update your review.");
      onUpdated(data.review, review.rating);
      setEditing(false);
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Could not update your review.");
    }
  }, [comment, name, onUpdated, rating, review.id, review.rating]);

  const handleDelete = useCallback(async () => {
    if (!window.confirm("Delete your review? This can't be undone.")) return;
    setStatus("loading");
    setError("");
    try {
      const res = await fetch(`/api/reviews/${review.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not delete your review.");
      onDeleted(review.id, review.rating);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Could not delete your review.");
    }
  }, [onDeleted, review.id, review.rating]);

  if (editing) {
    const nameId = `edit-name-${review.id}`;
    const commentId = `edit-comment-${review.id}`;
    return (
      <li className="pt-6 first:pt-0">
        <div className="space-y-3 rounded-xl border border-ember-600/30 bg-cream/60 p-4 dark:bg-white/5">
          <div className="flex gap-1">
            {STAR_VALUES.map((i) => (
              <button
                type="button"
                key={i}
                onClick={() => setRating(i)}
                aria-label={`${i} star${i > 1 ? "s" : ""}`}
                className="text-ember-500"
              >
                <FaStar size={20} className={i <= rating ? "" : "text-brick-700/15"} />
              </button>
            ))}
          </div>
          <label htmlFor={nameId} className="sr-only">
            Name
          </label>
          <input
            id={nameId}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            className="w-full rounded-lg border border-brick-700/20 bg-white px-3 py-2 text-sm text-[#2B0F08] placeholder:text-[#2B0F08]/40 outline-none ring-ember-500/40 focus:ring-2"
          />
          <label htmlFor={commentId} className="sr-only">
            Review
          </label>
          <textarea
            id={commentId}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={600}
            rows={3}
            className="w-full rounded-lg border border-brick-700/20 bg-white px-3 py-2 text-sm text-[#2B0F08] placeholder:text-[#2B0F08]/40 outline-none ring-ember-500/40 focus:ring-2"
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={status === "loading"}
              className="rounded-lg bg-ember-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-ember-500 disabled:opacity-60"
            >
              {status === "loading" ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded-lg border border-brick-700/20 px-4 py-2 text-sm text-brick-700"
            >
              Cancel
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li
      className="animate-fade-up pt-6 transition-colors first:pt-0 hover:bg-ember-600/[0.03] rounded-lg -mx-2 px-2"
      style={{ animationDelay: `${Math.min(index, 6) * 70}ms` }}
    >
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ember-600/10 text-xs font-semibold text-ember-600">
          {initials(review.name) || "?"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium text-brick-950">{review.name}</span>
            <span className="text-xs text-brick-700/80">{timeAgo(review.createdAt)}</span>
            {isMine && <span className="text-xs font-medium text-ember-600">· Your review</span>}
          </div>
          <Stars value={review.rating} />
          <p className="mt-1.5 whitespace-pre-line text-[15px] leading-relaxed text-brick-800">
            {review.comment}
          </p>
          {isMine && (
            <div className="mt-2 flex gap-3 text-xs font-medium">
              <button onClick={() => setEditing(true)} className="text-ember-600 hover:underline">
                Edit
              </button>
              <button onClick={handleDelete} className="text-brick-700/80 hover:underline">
                Delete
              </button>
            </div>
          )}
          {error && !editing && <p className="mt-1 text-xs text-red-500">{error}</p>}
        </div>
      </div>
    </li>
  );
});
