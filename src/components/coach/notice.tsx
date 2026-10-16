import type { ReactNode } from "react";

/** A caution inside a block: a 2px ink rule at the left and a medium weight title, so it reads without colour. */
export function Notice({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div role="note" className="flex flex-col gap-1 border-l-2 border-ink pl-3">
      <p className="font-medium">{title}</p>
      {children ? <div className="text-small">{children}</div> : null}
    </div>
  );
}
