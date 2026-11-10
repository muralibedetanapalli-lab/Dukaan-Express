import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-8">
      <div className="flex gap-3 overflow-hidden">
        <Skeleton className="h-40 w-[85%] shrink-0 rounded-2xl sm:w-[420px]" />
        <Skeleton className="h-40 w-[420px] shrink-0 rounded-2xl" />
      </div>
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-9">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-2xl border p-2.5">
            <Skeleton className="aspect-square rounded-xl" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
