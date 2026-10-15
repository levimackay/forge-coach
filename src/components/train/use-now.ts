"use client";

import { useSyncExternalStore } from "react";
import type { IsoDate } from "@/lib/domain/types";
import { localDate } from "@/lib/local/dates";

/**
 * A shared ticking clock. Reading the time during render is a prerender error
 * with cacheComponents, so components get it through a store that reports
 * `null` on the server and during hydration.
 */
function createClock(stepMs: number) {
  let value = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  const listeners = new Set<() => void>();

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      if (listeners.size === 1) {
        value = Date.now();
        timer = setInterval(() => {
          value = Date.now();
          listeners.forEach((l) => l());
        }, stepMs);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          clearInterval(timer);
          value = 0;
        }
      };
    },
    get(): number {
      if (value === 0) value = Date.now();
      return value;
    },
  };
}

const minuteClock = createClock(60_000);
const secondClock = createClock(1_000);
const onServer = () => null;

/** Milliseconds since the epoch, refreshed every minute. */
export function useNow(): number | null {
  return useSyncExternalStore<number | null>(minuteClock.subscribe, minuteClock.get, onServer);
}

/** Milliseconds since the epoch, refreshed every second. Mount it only while something is counting. */
export function useNowSeconds(): number | null {
  return useSyncExternalStore<number | null>(secondClock.subscribe, secondClock.get, onServer);
}

/** Today's date on this device, or null before the client has the time. */
export function useToday(): IsoDate | null {
  const now = useNow();
  return now === null ? null : localDate(new Date(now));
}
