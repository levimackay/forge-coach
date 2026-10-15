import type { ReactNode } from "react";

/** Numbered instructions. The browser's own list numbers are reset by the base styles, so they are drawn here. */
export function Steps({ children }: { children: ReactNode[] }) {
  return (
    <ol className="flex flex-col gap-4">
      {children.map((child, i) => (
        <li key={i} className="flex gap-3">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line text-[15px] font-semibold text-ink-dim"
          >
            {i + 1}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2 text-[17px]">{child}</div>
        </li>
      ))}
    </ol>
  );
}
