import type { ReactNode } from "react";

/** Numbered instructions as rows: the number in the label column, the step beside it. The browser's own list numbers are reset by the base styles, so they are drawn here. */
export function Steps({ children }: { children: ReactNode[] }) {
  return (
    <ol className="border-b border-rule">
      {children.map((child, i) => (
        <li key={i} className="grid grid-cols-[var(--label-col)_minmax(0,1fr)] items-baseline border-t border-rule py-3">
          <span aria-hidden="true" className="text-fig-24">
            {i + 1}
          </span>
          <div className="flex min-w-0 flex-col gap-2">{child}</div>
        </li>
      ))}
    </ol>
  );
}
