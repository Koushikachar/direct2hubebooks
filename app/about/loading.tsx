import { NavSkeleton, Skeleton, SkeletonCard, SkeletonStatus, SkeletonText } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen">
      <NavSkeleton />
      <SkeletonStatus label="Loading about page…">
        <section className="hero-glow">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-2">
            <div className="space-y-5">
              <Skeleton className="h-7 w-44 rounded-full" />
              <Skeleton className="h-10 w-4/5" />
              <Skeleton className="h-10 w-3/5" />
              <SkeletonText lines={4} lineClassName="h-4" />
            </div>
            <Skeleton className="aspect-[4/3] w-full rounded-3xl" />
          </div>
        </section>
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="mx-auto mb-10 max-w-2xl space-y-3 text-center">
            <Skeleton className="mx-auto h-8 w-2/3" />
            <Skeleton className="mx-auto h-4 w-1/2" />
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} aria-hidden="true" className="card space-y-4 p-4">
                <Skeleton className="aspect-[3/4] w-full rounded-xl" />
                <Skeleton className="h-4 w-1/2" />
                <SkeletonText lines={2} />
              </div>
            ))}
          </div>
        </section>
        <section className="mx-auto grid max-w-6xl grid-cols-1 gap-5 px-4 pb-16 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonCard key={i} lines={2} />
          ))}
        </section>
      </SkeletonStatus>
    </div>
  );
}
