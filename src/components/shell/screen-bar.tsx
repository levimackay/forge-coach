import type { ReactNode } from "react";

/**
 * The top row of a screen: one thing on the left, one on the right, at least 44px tall.
 * Put the sync status (SyncChip) in one of the two slots.
 */
export function ScreenBar({ start, end, tall = false }: { start?: ReactNode; end?: ReactNode; tall?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 ${tall ? "min-h-[52px]" : "min-h-11"}`}>
      <div className="min-w-0 flex-1">{start}</div>
      {end ? <div className="shrink-0">{end}</div> : null}
    </div>
  );
}
