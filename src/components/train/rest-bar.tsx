"use client";

import { useEffect, type ReactNode } from "react";
import { formatClock } from "./format";
import { useNowSeconds } from "./use-now";

export interface RestState {
  endsAt: number;
  total: number;
}

const storageKey = (workoutId: string) => `forge-rest:${workoutId}`;

/** A rest timer survives the app being closed mid-workout, so it is kept per workout on this device. */
export function loadRest(workoutId: string): RestState | null {
  try {
    const raw = window.localStorage.getItem(storageKey(workoutId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RestState>;
    return typeof parsed.endsAt === "number" && typeof parsed.total === "number"
      ? { endsAt: parsed.endsAt, total: parsed.total }
      : null;
  } catch {
    return null;
  }
}

export function saveRest(workoutId: string, rest: RestState | null): void {
  try {
    if (rest) window.localStorage.setItem(storageKey(workoutId), JSON.stringify(rest));
    else window.localStorage.removeItem(storageKey(workoutId));
  } catch {
    // Storage can be blocked in private windows. The timer then only lives in memory.
  }
}

// A timer that ran out this long ago belongs to an earlier visit and is not worth showing.
const STALE_AFTER_SECONDS = 600;
const ADJUST_SECONDS = 15;

/** Never more than the rest that was set: the shared clock can lag the moment the set was saved by up to a second. */
const secondsLeft = (rest: RestState, now: number): number => Math.min(rest.total, Math.ceil((rest.endsAt - now) / 1000));

/**
 * The big figure at the top of the workout screen, with two short lines at its right and a 4px bar
 * under it. While a rest runs the bar is red and empties; otherwise it is a hairline.
 */
function ClockFace({
  figure,
  unit,
  lines,
  fraction,
  timer,
}: {
  figure: ReactNode;
  unit?: string;
  lines: [string, string];
  /** 0 to 1 of the rest still to go. Leave out when no rest is running. */
  fraction?: number;
  timer?: boolean;
}) {
  return (
    <>
      <div className="px-safe">
        <div
          role={timer ? "timer" : undefined}
          aria-label={timer ? "Rest timer" : undefined}
          className="flex h-[100px] items-end justify-between gap-4"
        >
          <p className="-ml-[5px] flex items-baseline text-fig-112 leading-[90px]">
            {figure}
            {unit ? <span className="ml-1 text-body tracking-normal">{unit}</span> : null}
          </p>
          <p className="pb-3 text-right text-word">
            {lines[0]}
            <br />
            {lines[1]}
          </p>
        </div>
      </div>
      <div className="relative h-1" aria-hidden="true">
        {fraction === undefined ? (
          <div className="absolute inset-x-0 bottom-0 h-px bg-rule" />
        ) : (
          <div className="h-full bg-red transition-[width] duration-1000 ease-linear" style={{ width: `${fraction * 100}%` }} />
        )}
      </div>
    </>
  );
}

/** The workout clock while a rest runs: time left, and which set is next. */
export function RestClock({
  rest,
  onChange,
  next,
}: {
  rest: RestState;
  onChange: (next: RestState | null) => void;
  /** "Set 2 next", or empty when there is nothing next. */
  next: string;
}) {
  const now = useNowSeconds();
  const remaining = now === null ? null : secondsLeft(rest, now);
  const over = remaining !== null && remaining <= 0;
  const stale = remaining !== null && remaining < -STALE_AFTER_SECONDS;

  useEffect(() => {
    if (stale) onChange(null);
  }, [stale, onChange]);

  useEffect(() => {
    if (over) navigator.vibrate?.(200);
  }, [over]);

  const figure = remaining === null ? " " : over ? "Go" : formatClock(remaining);
  const fraction = remaining === null ? 0 : Math.min(1, Math.max(0, remaining / Math.max(rest.total, 1)));
  return <ClockFace timer figure={figure} lines={[over ? "Rest over" : "Rest", next]} fraction={fraction} />;
}

/** The workout clock with no rest running: how long the session has gone, and how many sets are in. */
export function SessionClock({ minutes, sets }: { minutes: number | null; sets: string }) {
  const hours = minutes !== null && minutes >= 60;
  const figure =
    minutes === null ? " " : hours ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}` : String(minutes);
  return <ClockFace figure={figure} unit={minutes === null ? undefined : hours ? "h" : "min"} lines={["Elapsed", sets]} />;
}

/** Take 15 seconds off, add 15, or end the rest. A full-bleed strip of three cells. */
export function RestControls({ rest, onChange }: { rest: RestState; onChange: (next: RestState | null) => void }) {
  const now = useNowSeconds();
  const remaining = now === null ? null : secondsLeft(rest, now);
  if (remaining === null || remaining < -STALE_AFTER_SECONDS) return null;

  const shift = (seconds: number) =>
    onChange({ ...rest, endsAt: rest.endsAt + seconds * 1000, total: Math.max(rest.total + seconds, 1) });
  const cell = "flex h-full items-center justify-center text-control active:bg-ink active:text-ground";

  return (
    <div role="group" aria-label="Rest timer controls" className="bleed grid h-14 grid-cols-3 border-y border-rule">
      <button type="button" className={cell} aria-label={`Take ${ADJUST_SECONDS} seconds off the rest`} onClick={() => shift(-ADJUST_SECONDS)}>
        −{ADJUST_SECONDS}s
      </button>
      <button type="button" className={`${cell} border-l border-rule`} aria-label={`Add ${ADJUST_SECONDS} seconds to the rest`} onClick={() => shift(ADJUST_SECONDS)}>
        +{ADJUST_SECONDS}s
      </button>
      <button type="button" className={`${cell} border-l border-rule`} onClick={() => onChange(null)}>
        {remaining <= 0 ? "Dismiss" : "Skip"}
      </button>
    </div>
  );
}
