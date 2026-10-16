"use client";

import { useLayoutEffect } from "react";
import { Button } from "@/components/ui/button";
import { named } from "@/components/ui/name";
import { ScreenBar } from "@/components/shell/screen-bar";
import { formatClock } from "./format";
import { secondsLeft, spokenClock, type RestState } from "./rest-state";
import { useNowSeconds } from "./use-now";

/**
 * The screen between two sets: the time left in big light figures with a red bar that empties, and
 * what comes next. It ends itself at zero, so the only control is the band that ends it early.
 */
export function RestScreen({
  rest,
  next,
  onDone,
}: {
  rest: RestState;
  /** The exercise and set that follow, or null when nothing does. */
  next: { name: string; set: string } | null;
  onDone: () => void;
}) {
  const now = useNowSeconds();
  const remaining = now === null ? null : secondsLeft(rest, now);
  const over = remaining !== null && remaining <= 0;

  // Before paint, so a rest that ended while the app was away never shows as a frame of 0:00.
  useLayoutEffect(() => {
    if (!over) return;
    navigator.vibrate?.(200);
    onDone();
  }, [over, onDone]);

  const fraction = remaining === null ? 1 : Math.min(1, Math.max(0, remaining / Math.max(rest.total, 1)));

  return (
    <div className="flex flex-1 flex-col pb-[calc(var(--live-band-height)+env(safe-area-inset-bottom))]">
      <ScreenBar start={<p className="text-name">Rest.</p>} />
      <p
        role="timer"
        aria-label={remaining === null ? "Rest timer" : spokenClock(remaining)}
        className="bleed mt-16 text-[min(160px,42vw)] font-light leading-[140px] tracking-[-0.05em]"
      >
        {remaining === null ? " " : formatClock(remaining)}
      </p>
      <div className="bleed mt-2 h-1" aria-hidden="true">
        <div className="h-full bg-red transition-[width] duration-1000 ease-linear" style={{ width: `${fraction * 100}%` }} />
      </div>
      {next ? (
        <section aria-label="Next up" className="pt-9">
          <p className="font-light">Next up</p>
          <h1 className="mt-1 text-name">{named(next.name)}</h1>
          <p className="mt-0.5 font-light">{next.set}</p>
        </section>
      ) : null}
      <Button variant="live" pinned="bottom" onClick={onDone}>
        Skip rest
      </Button>
    </div>
  );
}
