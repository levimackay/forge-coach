import type { Exercise, IsoDate, IsoDateTime, Uuid, Workout, WorkoutSet } from "@/lib/domain/types";
import { effectiveLoad, setE1rm } from "./e1rm";
import { loggedWorkSets } from "./logged";

export interface SetSummary {
  work_sets: number;
  total_reps: number;
  max_reps: number;
  /** Highest e1RM set (ties, as past the rep cap, go to more reps); when no set has an e1RM, the set with the most reps. */
  best_set: { reps: number; load: number | null; e1rm: number | null };
  top_e1rm: number | null;
  /** Load of the hardest set (for assisted work that is the least assistance). */
  top_load: number | null;
  reps_at_top_load: number;
  /** Sum of effective load x reps. Null when any set has no knowable load. */
  volume_load: number | null;
  avg_rir: number | null;
  pain: boolean;
}

export interface SeriesPoint extends SetSummary {
  workout_id: Uuid;
  date: IsoDate;
  started_at: IsoDateTime;
}

export function summarizeSets(exercise: Exercise, sets: WorkoutSet[], bodyweight: number | null): SetSummary | null {
  const work = sets.filter((s) => !s.deleted_at && !s.is_warmup && s.reps > 0);
  if (!work.length) return null;

  const rows = work.map((set) => ({ set, e1rm: setE1rm(set, exercise, bodyweight) }));
  const withE1rm = rows.filter((r) => r.e1rm !== null);
  // Reps past the Epley cap all score the same e1RM, so a tie goes to the set with more reps.
  const best = withE1rm.length
    ? withE1rm.reduce((a, b) => {
        const be = b.e1rm as number;
        const ae = a.e1rm as number;
        return be > ae || (be === ae && b.set.reps > a.set.reps) ? b : a;
      })
    : rows.reduce((a, b) => (b.set.reps > a.set.reps ? b : a));

  const effective = work.map((s) => effectiveLoad(exercise, s.load, bodyweight));
  const volume_load = effective.every((l) => l !== null)
    ? work.reduce((sum, s, i) => sum + (effective[i] as number) * s.reps, 0)
    : null;

  const hardness = (s: WorkoutSet) => (exercise.load_type === "assisted" ? -(s.load ?? 0) : (s.load ?? 0));
  const hardest = Math.max(...work.map(hardness));
  const atTop = work.filter((s) => hardness(s) === hardest);

  const rirs = work.map((s) => s.rir).filter((r): r is number => r !== null);

  return {
    work_sets: work.length,
    total_reps: work.reduce((n, s) => n + s.reps, 0),
    max_reps: Math.max(...work.map((s) => s.reps)),
    best_set: { reps: best.set.reps, load: best.set.load, e1rm: best.e1rm },
    top_e1rm: best.e1rm,
    top_load: atTop[0].load,
    reps_at_top_load: Math.max(...atTop.map((s) => s.reps)),
    volume_load,
    avg_rir: rirs.length ? rirs.reduce((a, b) => a + b, 0) / rirs.length : null,
    pain: sets.some((s) => !s.deleted_at && s.pain),
  };
}

/** One point per completed workout that has work sets of `exercise`, oldest first. */
export function exerciseSeries(input: {
  exercise: Exercise;
  workouts: Workout[];
  sets: WorkoutSet[];
  bodyweight: number | null;
  timeZone: string;
}): SeriesPoint[] {
  const groups = new Map<Uuid, { workout: Workout; date: IsoDate; sets: WorkoutSet[] }>();
  for (const l of loggedWorkSets(input.workouts, input.sets, input.timeZone)) {
    if (l.set.exercise_id !== input.exercise.id) continue;
    const g = groups.get(l.workout.id) ?? { workout: l.workout, date: l.date, sets: [] };
    g.sets.push(l.set);
    groups.set(l.workout.id, g);
  }
  const points: SeriesPoint[] = [];
  for (const g of groups.values()) {
    const summary = summarizeSets(input.exercise, g.sets, input.bodyweight);
    if (summary) points.push({ workout_id: g.workout.id, date: g.date, started_at: g.workout.started_at, ...summary });
  }
  return points;
}
