export interface WeekColumn {
  key: string;
  /** Short label under the column, such as "Oct 13". */
  label: string;
  completed: number;
  /** Sessions the program calls for that week. Null when there is no program. */
  planned: number | null;
  inProgress: boolean;
}

export interface WeekColumnsProps {
  weeks: WeekColumn[];
  /** Names the list for screen readers. */
  label: string;
  height?: number;
}

/**
 * One column per week: an ink bar for sessions done, standing on one baseline hairline, with the count
 * above it. Sessions planned are a 2px ink line wider than the bar, so a short week shows the gap and a
 * full week shows the line level with the top. The week still in progress has its date underlined.
 */
export function WeekColumns({ weeks, label, height = 120 }: WeekColumnsProps) {
  const top = Math.max(1, ...weeks.map((w) => Math.max(w.completed, w.planned ?? 0)));
  const px = (n: number) => Math.round((n / top) * height);

  return (
    <ul aria-label={label} className="flex">
      {weeks.map((w) => {
        const tallest = Math.max(w.completed, w.planned ?? 0);
        return (
          <li
            key={w.key}
            className="min-w-0 flex-1"
            aria-label={`Week of ${w.label}${w.inProgress ? ", in progress" : ""}: ${w.completed}${w.planned !== null ? ` of ${w.planned} planned` : ""} sessions`}
          >
            <div aria-hidden="true" className="flex flex-col items-center justify-end border-b border-rule" style={{ height: height + 28 }}>
              <span className="text-fig-24">{w.completed}</span>
              <div className="relative mt-1 w-4" style={{ height: px(tallest) }}>
                <div className="absolute inset-x-0 bottom-0 bg-ink" style={{ height: px(w.completed) }} />
                {w.planned !== null ? <div className="absolute -inset-x-2 h-0.5 bg-ink" style={{ bottom: px(w.planned) - 1 }} /> : null}
              </div>
            </div>
            <span aria-hidden="true" className="block pt-2 text-center text-small">
              {/* "Oct 13" stacks as two lines in every column, so the labels line up. */}
              {w.label.split(" ").map((part, i) => (
                <span key={i} className={`block ${w.inProgress ? "underline decoration-2 underline-offset-4" : ""}`}>
                  {part}
                </span>
              ))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
