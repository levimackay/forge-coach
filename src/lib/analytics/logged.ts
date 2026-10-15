import type { IsoDate, Workout, WorkoutSet } from "@/lib/domain/types";
import { localDate, time } from "./dates";

export interface LoggedSet {
  set: WorkoutSet;
  workout: Workout;
  date: IsoDate;
}

/**
 * Work sets (no warmups, no zero-rep attempts, nothing soft-deleted) that belong to a
 * completed workout, oldest first (workout start, then set completion, then set index). Every analytic reads sets through this one filter so
 * "what counts" cannot drift between charts.
 */
export function loggedWorkSets(workouts: Workout[], sets: WorkoutSet[], timeZone: string): LoggedSet[] {
  const done = new Map<string, Workout>();
  for (const w of workouts) if (w.status === "completed" && !w.deleted_at) done.set(w.id, w);
  const out: LoggedSet[] = [];
  for (const set of sets) {
    if (set.deleted_at || set.is_warmup || set.reps <= 0) continue;
    const workout = done.get(set.workout_id);
    if (workout) out.push({ set, workout, date: localDate(workout.started_at, timeZone) });
  }
  // set_index alone is not trusted for order across exercises, so completion time comes first.
  return out.sort(
    (a, b) =>
      time(a.workout.started_at) - time(b.workout.started_at) ||
      time(a.set.completed_at) - time(b.set.completed_at) ||
      a.set.set_index - b.set.set_index,
  );
}

// A workout left running overnight would report a nonsense duration.
export const MAX_SESSION_MINUTES = 360;

export function sessionMinutes(w: Pick<Workout, "started_at" | "completed_at">): number | null {
  if (!w.completed_at) return null;
  const minutes = Math.round((time(w.completed_at) - time(w.started_at)) / 60_000);
  return minutes > 0 && minutes <= MAX_SESSION_MINUTES ? minutes : null;
}
