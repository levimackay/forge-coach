import type { IsoDateTime, Uuid, Workout, WorkoutSet } from "@/lib/domain/types";
import { ENGINE_CONFIG } from "./config";
import type { ConsistencyInfo, RecoveryEntry, SessionHistoryEntry } from "./types";
import { daysBetween } from "./util";

export type WorkoutRow = Pick<Workout, "id" | "status" | "started_at" | "completed_at" | "deleted_at"> &
  Partial<Pick<Workout, "program_day_id">>;
export type SetRow = Pick<
  WorkoutSet,
  "workout_id" | "planned_exercise_id" | "exercise_id" | "set_index" | "reps" | "load" | "rir" | "is_warmup" | "pain"
> &
  Partial<Pick<WorkoutSet, "deleted_at">>;

const finishedAt = (w: WorkoutRow): IsoDateTime => w.completed_at ?? w.started_at;

// Completed sessions of one planned exercise, newest first.
export function sessionsFromRows(
  workouts: WorkoutRow[],
  sets: SetRow[],
  plannedExerciseId: Uuid,
  limit: number = ENGINE_CONFIG.historyLimit,
): SessionHistoryEntry[] {
  const done = new Map(workouts.filter((w) => w.status === "completed" && !w.deleted_at).map((w) => [w.id, w]));
  const byWorkout = new Map<Uuid, SetRow[]>();
  for (const s of sets) {
    if (s.planned_exercise_id !== plannedExerciseId || s.deleted_at || !done.has(s.workout_id)) continue;
    const list = byWorkout.get(s.workout_id);
    if (list) list.push(s);
    else byWorkout.set(s.workout_id, [s]);
  }
  return [...byWorkout.entries()]
    .map(([id, rows]) => ({
      workout_id: id,
      completed_at: finishedAt(done.get(id) as WorkoutRow),
      sets: rows.map(({ exercise_id, set_index, reps, load, rir, is_warmup, pain }) => ({
        exercise_id,
        set_index,
        reps,
        load,
        rir,
        is_warmup,
        pain,
      })),
    }))
    .sort((a, b) => Date.parse(b.completed_at) - Date.parse(a.completed_at))
    .slice(0, limit);
}

// Session counts for one program day. `plannedLast28d` is how many sessions of
// that day the program called for, which only the caller knows.
export function consistencyFromWorkouts(
  workouts: WorkoutRow[],
  programDayId: Uuid,
  now: IsoDateTime,
  plannedLast28d = 0,
): ConsistencyInfo {
  const mine = workouts.filter((w) => w.status === "completed" && !w.deleted_at && w.program_day_id === programDayId);
  const ages = mine.map((w) => daysBetween(finishedAt(w), now));
  return {
    days_since_last_session: ages.length ? Math.min(...ages) : null,
    sessions_last_28d: ages.filter((d) => d < 28).length,
    planned_last_28d: plannedLast28d,
  };
}

// How many sessions of one program day the program called for in the last 28 days.
// Only the days since the program began count, so a new program's first sessions are
// not read as missed ones. `since` is when the program was created (null: assume 28 days).
export function plannedSessionsLast28d(
  daysPerWeek: number,
  dayCount: number,
  since: IsoDateTime | null,
  now: IsoDateTime,
): number {
  const days = since === null ? 28 : Math.min(28, daysBetween(since, now));
  return Math.round(((daysPerWeek / Math.max(1, dayCount)) * days) / 7);
}

export interface RecoveryStatus {
  poor: boolean;
  poor_days: number;
  considered: number;
}

const isoDay = (iso: IsoDateTime): string => new Date(Date.parse(iso)).toISOString().slice(0, 10);

// A trend, not a single bad night: enough of the newest logs inside the window
// must show short sleep or high soreness.
export function recoveryStatus(logs: RecoveryEntry[], now: IsoDateTime): RecoveryStatus {
  const r = ENGINE_CONFIG.recovery;
  // A day of slack on the newer side covers logs dated in a timezone ahead of UTC.
  const today = isoDay(new Date(Date.parse(now) + 86_400_000).toISOString());
  const oldest = isoDay(new Date(Date.parse(now) - r.windowDays * 86_400_000).toISOString());
  const recent = logs
    .filter((l) => !l.deleted_at && l.date >= oldest && l.date <= today)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, r.logsConsidered);
  const poorDays = recent.filter(
    (l) =>
      (l.sleep_hours !== null && l.sleep_hours < r.poorSleepHours) || (l.soreness !== null && l.soreness >= r.poorSoreness),
  ).length;
  return { poor: poorDays >= r.poorDaysRequired, poor_days: poorDays, considered: recent.length };
}
