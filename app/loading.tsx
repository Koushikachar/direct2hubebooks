import { NavSkeleton, Skeleton, SkeletonCard, SkeletonStatus, SkeletonText } from "@/components/Skeleton";

// Shown instantly while the home page (or any page without its own
// loading.tsx) is being prepared. Mirrors the real layout: header, hero copy
// beside a phone-shaped video card, then the feature cards.
export default function Loading() {
  return (
    <div className="min-h-screen">
      <NavSkeleton />
      <SkeletonStatus label="Loading Direct2hub…">
        <section className="hero-glow">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-2">
            <div className="flex flex-col items-center space-y-6 lg:items-start">
              <Skeleton className="h-8 w-72 max-w-full rounded-full" />
              <div className="w-full space-y-3">
                <Skeleton className="mx-auto h-11 w-full lg:mx-0" />
                <Skeleton className="mx-auto h-11 w-5/6 lg:mx-0" />
                <Skeleton className="mx-auto h-11 w-2/3 lg:mx-0" />
              </div>
              <SkeletonText lines={2} className="w-full max-w-xl" lineClassName="h-4" />
              <div className="flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
                <Skeleton className="h-12 w-full rounded-full sm:w-48" />
                <Skeleton className="h-12 w-full rounded-full sm:w-40" />
              </div>
              <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 lg:justify-start">
                {[104, 120, 116].map((w, i) => (
                  <Skeleton key={i} className="h-4" style={{ width: w }} />
                ))}
              </div>
            </div>
            <div className="flex justify-center">
              <Skeleton className="h-[26rem] w-[15rem] rounded-[2rem] sm:h-[30rem] sm:w-[17rem]" />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="mx-auto mb-10 max-w-2xl space-y-3 text-center">
            <Skeleton className="mx-auto h-8 w-3/4" />
            <Skeleton className="mx-auto h-4 w-2/3" />
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </section>
      </SkeletonStatus>
    </div>
  );
}
