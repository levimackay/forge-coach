/** Placeholder block for content that is still loading. Size it with className. */
export function Skeleton({ className = "h-5 w-full" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-[10px] bg-raised ${className}`} />;
}
