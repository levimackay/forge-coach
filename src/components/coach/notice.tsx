import type { ReactNode } from "react";

/** A caution inside a card: bordered rather than colored, so it reads without relying on hue. */
export function Notice({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div role="note" className="flex flex-col gap-1 rounded-control border border-ink-faint bg-raised p-3">
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {children ? <div className="text-[15px] text-ink-dim">{children}</div> : null}
    </div>
  );
}
