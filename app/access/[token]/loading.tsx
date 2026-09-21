import { NavSkeleton, ProductDetailsSkeleton, Skeleton, SkeletonStatus } from "@/components/Skeleton";

// The access page checks the link, the payment and this device before it
// shows anything — a skeleton of the final "your file is ready" layout keeps
// the buyer oriented while that happens.
export default function Loading() {
  return (
    <div className="min-h-screen">
      <NavSkeleton />
      <SkeletonStatus label="Checking your download link…">
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5 lg:items-start lg:gap-8">
            <div className="lg:col-span-3">
              <ProductDetailsSkeleton />
            </div>
            <div className="lg:col-span-2">
              <div aria-hidden="true" className="card space-y-4 p-6 text-center">
                <Skeleton className="mx-auto h-4 w-36" />
                <Skeleton className="mx-auto h-7 w-44" />
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="mx-auto h-3 w-40" />
                <Skeleton className="mx-auto h-4 w-40" />
              </div>
            </div>
          </div>
        </main>
      </SkeletonStatus>
    </div>
  );
}
