import { NavSkeleton, Skeleton, SkeletonStatus } from "@/components/Skeleton";

// This page asks the payment gateway whether the payment went through, which
// can take a second or two — say so, rather than showing a blank screen.
export default function Loading() {
  return (
    <>
      <NavSkeleton />
      <SkeletonStatus label="Confirming your payment…">
        <main className="mx-auto max-w-xl px-4 py-20 text-center">
          <div className="card space-y-5 p-8">
            <Skeleton className="mx-auto h-12 w-12 rounded-full" />
            <h1 className="font-display text-2xl font-bold">Confirming your payment…</h1>
            <p className="text-sm text-brick-700/80 dark:text-cream/70">
              Hang on for a moment — we&apos;re checking with your bank. Please don&apos;t close this page.
            </p>
            <Skeleton className="mx-auto h-3 w-2/3" />
          </div>
        </main>
      </SkeletonStatus>
    </>
  );
}
