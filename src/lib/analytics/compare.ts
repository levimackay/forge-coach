import type { DayFocus, Exercise, IsoDate, ProgramDay, Uuid, Workout, WorkoutSet } from "@/lib/domain/types";
import { localDate, time } from "./dates";
import { exerciseSeries, type SeriesPoint } from "./performance";
import { loggedWorkSets, sessionMinutes } from "./logged";

export const DEFAULT_COMPARE_SESSIONS = 4;

export interface Delta {
  from_workout_id: Uuid;
  to_workout_id: Uuid;
  /** Change in top-set e1RM. Null when either session has no e1RM. */
  e1rm: number | null;
  e1rm_pct: number | null;
  volume_load: number | null;
  total_reps: number;
  max_reps: number;
  work_sets: number;
}

const diff = (a: number | null, b: number | null) => (a !== null && b !== null ? b - a : null);

/** Change from the earlier point to the later one. */
export function delta(from: SeriesPoint, to: SeriesPoint): Delta {
  const e1rm = diff(from.top_e1rm, to.top_e1rm);
  return {
    from_workout_id: from.workout_id,
    to_workout_id: to.workout_id,
    e1rm,
    e1rm_pct: e1rm !== null && from.top_e1rm !== null && from.top_e1rm > 0 ? (e1rm / from.top_e1rm) * 100 : null,
    volume_load: diff(from.volume_load, to.volume_load),
    total_reps: to.total_reps - from.total_reps,
    max_reps: to.max_reps - from.max_reps,
    work_sets: to.work_sets - from.work_sets,
  };
}

export interface CompareSession {
  workout_id: Uuid;
  date: IsoDate;
  day_name: string | null;
  focus: DayFocus | null;
  work_sets: number;
  session_rpe: number | null;
  duration_minutes: number | null;
}

export interface ExerciseComparison {
  exercise_id: Uuid;
  name: string;
  /** One point per compared session that included the exercise, oldest first. */
  points: SeriesPoint[];
  latest_vs_previous: Delta | null;
  latest_vs_first: Delta | null;
}

export interface SessionComparison {
  sessions: CompareSession[];
  exercises: ExerciseComparison[];
}

/** Compare the last `limit` completed sessions of a day focus, or the listed workouts. */
export function compareSessions(input: {
  workouts: Workout[];
  sets: WorkoutSet[];
  program_days: ProgramDay[];
  exercises: Exercise[];
  bodyweight: number | null;
  timeZone: string;
  select: { focus: DayFocus } | { workoutIds: Uuid[] };
  limit?: number;
}): SessionComparison {
  const days = new Map(input.program_days.map((d) => [d.id, d]));
  const select = input.select;
  let picked = input.workouts.filter((w) => w.status === "completed" && !w.deleted_at);
  if ("focus" in select) {
    picked = picked.filter((w) => w.program_day_id !== null && days.get(w.program_day_id)?.focus === select.focus);
  } else {
    const ids = new Set(select.workoutIds);
    picked = picked.filter((w) => ids.has(w.id));
  }
  picked = picked
    .sort((a, b) => time(b.started_at) - time(a.started_at))
    .slice(0, input.limit ?? DEFAULT_COMPARE_SESSIONS)
    .reverse();

  const byWorkout = new Map<Uuid, Uuid[]>();
  for (const l of loggedWorkSets(picked, input.sets, input.timeZone)) {
    byWorkout.set(l.workout.id, [...(byWorkout.get(l.workout.id) ?? []), l.set.exercise_id]);
  }

  const sessions = picked.map((w): CompareSession => {
    const day = w.program_day_id ? days.get(w.program_day_id) : undefined;
    return {
      workout_id: w.id,
      date: localDate(w.started_at, input.timeZone),
      day_name: day?.name ?? null,
      focus: day?.focus ?? null,
      work_sets: byWorkout.get(w.id)?.length ?? 0,
      session_rpe: w.session_rpe,
      duration_minutes: sessionMinutes(w),
    };
  });

  // Most recent session's exercise order first, then anything only older sessions had.
  const order: Uuid[] = [];
  for (const w of [...picked].reverse()) {
    for (const id of byWorkout.get(w.id) ?? []) if (!order.includes(id)) order.push(id);
  }
  const library = new Map(input.exercises.map((e) => [e.id, e]));

  const exercises: ExerciseComparison[] = [];
  for (const id of order) {
    const exercise = library.get(id);
    if (!exercise) continue;
    const points = exerciseSeries({
      exercise,
      workouts: picked,
      sets: input.sets,
      bodyweight: input.bodyweight,
      timeZone: input.timeZone,
    });
    const last = points[points.length - 1];
    exercises.push({
      exercise_id: id,
      name: exercise.name,
      points,
      latest_vs_previous: points.length >= 2 ? delta(points[points.length - 2], last) : null,
      latest_vs_first: points.length >= 2 ? delta(points[0], last) : null,
    });
  }
  return { sessions, exercises };
}
