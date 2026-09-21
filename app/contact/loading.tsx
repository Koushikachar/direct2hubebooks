import { NavSkeleton, Skeleton, SkeletonField, SkeletonStatus, SkeletonText } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen">
      <NavSkeleton />
      <SkeletonStatus label="Loading contact page…">
        <div className="hero-glow border-b border-black/5 py-10 text-center dark:border-white/10">
          <Skeleton className="mx-auto h-9 w-56" />
          <Skeleton className="mx-auto mt-4 h-4 w-80 max-w-[85%]" />
        </div>
        <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-5">
            <div aria-hidden="true" className="card space-y-5 p-6 md:col-span-3">
              <SkeletonField />
              <SkeletonField />
              <div className="space-y-2">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-32 w-full rounded-xl" />
              </div>
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
            <div className="space-y-4 md:col-span-2">
              {[0, 1, 2].map((i) => (
                <div key={i} aria-hidden="true" className="card flex items-center gap-4 p-5">
                  <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
                  <SkeletonText lines={2} className="flex-1" />
                </div>
              ))}
            </div>
          </div>
        </main>
      </SkeletonStatus>
    </div>
  );
}
