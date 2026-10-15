"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
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

export function RestBar({
  rest,
  onChange,
}: {
  rest: RestState;
  onChange: (next: RestState | null) => void;
}) {
  const now = useNowSeconds();
  const ref = useRef<HTMLDivElement>(null);
  // Never more than the rest that was set: the shared clock can lag the moment the set was saved by up to a second.
  const remaining = now === null ? null : Math.min(rest.total, Math.ceil((rest.endsAt - now) / 1000));
  const over = remaining !== null && remaining <= 0;
  const stale = remaining !== null && remaining < -STALE_AFTER_SECONDS;
  const visible = remaining !== null && !stale;

  // Publishes the bar's height so the sticky "Log set" button can sit just above it.
  useEffect(() => {
    const el = ref.current;
    if (!visible || !el) return;
    const root = document.documentElement.style;
    const publish = () => root.setProperty("--rest-bar-height", `${el.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.removeProperty("--rest-bar-height");
    };
  }, [visible]);

  useEffect(() => {
    if (stale) onChange(null);
  }, [stale, onChange]);

  useEffect(() => {
    if (over) navigator.vibrate?.(200);
  }, [over]);

  if (remaining === null || stale) return null;

  const shift = (seconds: number) => onChange({ ...rest, endsAt: rest.endsAt + seconds * 1000, total: Math.max(rest.total + seconds, 1) });
  const fraction = Math.min(1, Math.max(0, remaining / Math.max(rest.total, 1)));

  return (
    <div
      ref={ref}
      role="timer"
      aria-label="Rest timer"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-safe"
    >
      <div className="h-1 bg-raised">
        <div className="h-full bg-ember transition-[width] duration-1000 ease-linear" style={{ width: `${fraction * 100}%` }} />
      </div>
      <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-ink-dim">{over ? "Rest is over" : "Rest"}</p>
          <p className="text-[28px] font-semibold leading-none">{over ? "Go" : formatClock(remaining)}</p>
        </div>
        <Button variant="secondary" size="sm" aria-label={`Take ${ADJUST_SECONDS} seconds off the rest`} onClick={() => shift(-ADJUST_SECONDS)}>
          -{ADJUST_SECONDS}s
        </Button>
        <Button variant="secondary" size="sm" aria-label={`Add ${ADJUST_SECONDS} seconds to the rest`} onClick={() => shift(ADJUST_SECONDS)}>
          +{ADJUST_SECONDS}s
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
          {over ? "Dismiss" : "Skip"}
        </Button>
      </div>
    </div>
  );
}
