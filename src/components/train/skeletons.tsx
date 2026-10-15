import { Skeleton } from "@/components/ui/skeleton";

/** Shown while the page shell loads and while the first local read finishes. */
export function ScreenSkeleton({ rows = 5, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-5 pt-2">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-2/5" />
        <Skeleton className="h-5 w-3/5" />
      </div>
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex flex-col gap-2 border-b border-line px-4 py-4 last:border-b-0">
            <Skeleton className="h-5 w-3/5" />
            <Skeleton className="h-4 w-2/5" />
          </div>
        ))}
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
