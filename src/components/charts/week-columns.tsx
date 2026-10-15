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

/** One column per week: filled to sessions done, with a line at sessions planned. */
export function WeekColumns({ weeks, label, height = 120 }: WeekColumnsProps) {
  const top = Math.max(1, ...weeks.map((w) => Math.max(w.completed, w.planned ?? 0)));
  const pct = (n: number) => `${(n / top) * 100}%`;

  return (
    <ul aria-label={label} className="flex gap-1.5">
      {weeks.map((w) => (
        <li
          key={w.key}
          className="flex min-w-0 flex-1 flex-col items-center gap-1"
          aria-label={`Week of ${w.label}${w.inProgress ? ", in progress" : ""}: ${w.completed}${w.planned !== null ? ` of ${w.planned} planned` : ""} sessions`}
        >
          <span aria-hidden="true" className="text-[15px] font-medium text-ink">
            {w.completed}
          </span>
          <div aria-hidden="true" className="relative w-full rounded-[4px] bg-raised" style={{ height }}>
            <div
              className={`absolute inset-x-0 bottom-0 rounded-[4px] ${w.inProgress ? "bg-ember/60" : "bg-ember"}`}
              style={{ height: pct(w.completed) }}
            />
            {w.planned !== null ? (
              <div className="absolute inset-x-[-2px] h-0.5 bg-ink" style={{ bottom: `calc(${pct(w.planned)} - 1px)` }} />
            ) : null}
          </div>
          <span aria-hidden="true" className="w-full text-center text-[11px] leading-tight text-ink-faint">
            {/* "Oct 13" stacks as two lines in every column, so the labels line up. */}
            {w.label.split(" ").map((part, i) => (
              <span key={i} className="block">
                {part}
              </span>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}
