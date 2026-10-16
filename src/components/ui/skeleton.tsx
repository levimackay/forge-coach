/** Loading content as empty hairline rows, 56px each. Static, so nothing in it fades or glows. */
export function Skeleton({ rows = 3, className = "" }: { rows?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={className}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-14 border-b border-rule" />
      ))}
    </div>
  );
}
