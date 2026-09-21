import type { CSSProperties, ReactNode } from "react";

// Skeleton loading primitives. A skeleton is the page's layout drawn as soft
// grey blocks with a moving highlight, shown while real content is on its
// way — so the page has its final shape from the first frame instead of
// jumping around (and feels faster than a blank screen or a spinner).
//
// Accessibility: every block is aria-hidden; the wrapper (SkeletonStatus)
// announces a single "Loading …" message to screen readers. The shimmer is
// switched off for people who prefer reduced motion (see globals.css).

export function Skeleton({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} style={style} />;
}

/** Paragraph-like stack of lines; the last one is shorter, like real text. */
export function SkeletonText({
  lines = 3,
  className = "",
  lineClassName = "h-3.5",
  lastLineWidth = "62%",
}: {
  lines?: number;
  className?: string;
  lineClassName?: string;
  lastLineWidth?: string;
}) {
  return (
    <div aria-hidden="true" className={`space-y-2.5 ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className={lineClassName}
          style={i === lines - 1 && lines > 1 ? { width: lastLineWidth } : undefined}
        />
      ))}
    </div>
  );
}

/** Wraps a whole skeleton screen: one polite "Loading…" announcement, busy state. */
export function SkeletonStatus({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Matches the sticky site header (logo + links) so the page doesn't shift. */
export function NavSkeleton() {
  return (
    <header aria-hidden="true" className="glass-header sticky top-0 z-50">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-full sm:h-10 sm:w-10" />
          <Skeleton className="h-5 w-24" />
        </div>
        <div className="hidden items-center gap-6 md:flex">
          {[44, 48, 60, 44].map((w, i) => (
            <Skeleton key={i} className="h-4" style={{ width: w }} />
          ))}
        </div>
        <Skeleton className="h-9 w-9 rounded-full md:hidden" />
      </div>
    </header>
  );
}

/** A `.card` with a heading line and some text lines. */
export function SkeletonCard({ className = "", lines = 3 }: { className?: string; lines?: number }) {
  return (
    <div aria-hidden="true" className={`card space-y-4 p-6 ${className}`}>
      <Skeleton className="h-11 w-11 rounded-xl" />
      <Skeleton className="h-5 w-2/3" />
      <SkeletonText lines={lines} />
    </div>
  );
}

/** A form field: label line + input box. */
export function SkeletonField() {
  return (
    <div aria-hidden="true" className="space-y-2">
      <Skeleton className="h-3.5 w-28" />
      <Skeleton className="h-11 w-full rounded-xl" />
    </div>
  );
}

/** Shapes of the product description column used on /price and /access. */
export function ProductDetailsSkeleton() {
  return (
    <div aria-hidden="true" className="card space-y-5 p-6 sm:p-8">
      <Skeleton className="aspect-[16/9] w-full rounded-2xl" />
      <Skeleton className="h-8 w-4/5" />
      <SkeletonText lines={3} />
      <div className="flex flex-wrap gap-2 pt-1">
        {[96, 112, 104].map((w, i) => (
          <Skeleton key={i} className="h-7 rounded-full" style={{ width: w }} />
        ))}
      </div>
      <div className="flex items-center gap-3 border-t border-black/5 pt-5 dark:border-white/10">
        <Skeleton className="h-11 w-11 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-56 max-w-full" />
        </div>
      </div>
    </div>
  );
}

/** A review row: avatar, name + stars, comment. */
export function ReviewSkeleton() {
  return (
    <li aria-hidden="true" className="flex gap-3 pt-6 first:pt-0">
      <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
      <div className="flex-1 space-y-2.5">
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3.5 w-20" />
        </div>
        <SkeletonText lines={2} />
      </div>
    </li>
  );
}
