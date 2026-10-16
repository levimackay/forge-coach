/**
 * The change over a series as one large light figure with its unit, and two short lines at the right:
 * where the series started and how long it ran. Screen readers get the sentence instead.
 */
export function TrendStat({ value, unit, lines, summary }: { value: string; unit: string; lines: string[]; summary: string }) {
  return (
    <div className="mt-1 flex items-end justify-between gap-4 border-t border-rule pt-3.5">
      <p aria-hidden="true" className="flex items-baseline">
        <span className={value.length <= 5 ? "text-fig-72" : "text-fig-48"}>{value}</span>
        <span className="ml-1">{unit}</span>
      </p>
      <p aria-hidden="true" className="pb-1 text-right">
        {lines.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </p>
      <p className="sr-only">{summary}</p>
    </div>
  );
}
