import { Skeleton, SkeletonStatus } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen bg-cream dark:bg-[#120A08]">
      <SkeletonStatus label="Loading admin…">
        <div aria-hidden="true" className="border-b border-black/5 bg-white px-4 py-4 dark:border-white/10 dark:bg-[#1B100C] sm:px-8">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-9 w-24 rounded-lg" />
          </div>
        </div>
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-8">
          <div className="flex gap-2">
            {[88, 76, 104, 84].map((w, i) => (
              <Skeleton key={i} className="h-9 rounded-lg" style={{ width: w }} />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      </SkeletonStatus>
    </div>
  );
}
