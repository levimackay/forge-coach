import { Skeleton } from "@/components/ui/skeleton";

/** Shown while the page shell loads and while the first local read finishes. Empty hairline rows, nothing that fades. */
export function ScreenSkeleton({ rows = 5, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="pt-2">
      <Skeleton rows={rows} className="border-t border-rule" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
