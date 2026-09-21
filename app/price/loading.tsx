import {
  NavSkeleton,
  ProductDetailsSkeleton,
  ReviewSkeleton,
  Skeleton,
  SkeletonField,
  SkeletonStatus,
} from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen">
      <NavSkeleton />
      <SkeletonStatus label="Loading pricing and checkout…">
        <div className="hero-glow border-b border-black/5 py-10 text-center dark:border-white/10">
          <Skeleton className="mx-auto h-9 w-72 max-w-[80%]" />
          <Skeleton className="mx-auto mt-4 h-4 w-96 max-w-[85%]" />
        </div>

        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5 lg:items-start lg:gap-8">
            <div className="lg:col-span-3">
              <ProductDetailsSkeleton />
            </div>
            <div className="lg:col-span-2">
              <div aria-hidden="true" className="card space-y-5 p-6">
                <div className="flex items-baseline justify-between">
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-8 w-20" />
                </div>
                <SkeletonField />
                <SkeletonField />
                <SkeletonField />
                <Skeleton className="h-12 w-full rounded-xl" />
                <Skeleton className="mx-auto h-3 w-48" />
              </div>
            </div>
          </div>

          <section className="mt-14 space-y-6">
            <Skeleton className="h-7 w-56" />
            <ul className="space-y-6 divide-y divide-brick-700/10">
              {[0, 1, 2].map((i) => (
                <ReviewSkeleton key={i} />
              ))}
            </ul>
          </section>
        </main>
      </SkeletonStatus>
    </div>
  );
}
