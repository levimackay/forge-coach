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

/** Never more than the rest that was set: the shared clock can lag the moment the set was saved by up to a second. */
export const secondsLeft = (rest: RestState, now: number): number =>
  Math.min(rest.total, Math.ceil((rest.endsAt - now) / 1000));

/** 151 seconds becomes "2 minutes 31 seconds left", for the timer's accessible name. */
export function spokenClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const parts = [];
  if (s >= 60) parts.push(`${Math.floor(s / 60)} ${s >= 120 ? "minutes" : "minute"}`);
  if (s % 60 !== 0 || s === 0) parts.push(`${s % 60} ${s % 60 === 1 ? "second" : "seconds"}`);
  return `${parts.join(" ")} left`;
}
