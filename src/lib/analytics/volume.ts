import type { Exercise, IsoDate, Muscle, Workout, WorkoutSet } from "@/lib/domain/types";
import { addDays, inRange } from "./dates";
import { loggedWorkSets } from "./logged";

// Typed as a Record so adding a Muscle to the domain type fails to compile until it is listed here.
const MUSCLE_LIST: Record<Muscle, true> = {
  chest: true,
  front_delts: true,
  side_delts: true,
  rear_delts: true,
  triceps: true,
  biceps: true,
  forearms: true,
  lats: true,
  upper_back: true,
  traps: true,
  quads: true,
  hamstrings: true,
  glutes: true,
  calves: true,
  abs: true,
};
export const MUSCLES = Object.keys(MUSCLE_LIST) as Muscle[];

/** A work set ending with more than this many reps in reserve is too easy to count. */
export const HARD_SET_MAX_RIR = 4;
export const SECONDARY_SET_WEIGHT = 0.5;
/** Weekly hard sets per muscle the engine treats as a working range (docs/plan/research.md). */
export const VOLUME_REFERENCE = { min: 10, max: 20 } as const;

export const isHardSet = (set: Pick<WorkoutSet, "rir">): boolean => set.rir === null || set.rir <= HARD_SET_MAX_RIR;

export interface MuscleVolume {
  muscle: Muscle;
  /** Fractional total: direct + 0.5 x indirect. */
  sets: number;
  direct_sets: number;
  indirect_sets: number;
  /** Workouts that gave this muscle at least one direct hard set. */
  sessions: number;
}

/** Hard sets per muscle over the 7 days starting at `weekStart`. Every muscle is returned, zeros included. */
export function weeklyHardSets(input: {
  workouts: Workout[];
  sets: WorkoutSet[];
  exercises: Exercise[];
  weekStart: IsoDate;
  timeZone: string;
}): MuscleVolume[] {
  const to = addDays(input.weekStart, 6);
  const library = new Map(input.exercises.map((e) => [e.id, e]));
  const acc = new Map(MUSCLES.map((m) => [m, { direct: 0, indirect: 0, sessions: new Set<string>() }]));

  for (const { set, workout, date } of loggedWorkSets(input.workouts, input.sets, input.timeZone)) {
    if (!inRange(date, input.weekStart, to) || !isHardSet(set)) continue;
    const exercise = library.get(set.exercise_id);
    const primary = exercise && acc.get(exercise.primary_muscle);
    if (!exercise || !primary) continue;
    primary.direct += 1;
    primary.sessions.add(workout.id);
    for (const m of new Set(exercise.secondary_muscles)) {
      if (m !== exercise.primary_muscle && acc.has(m)) (acc.get(m) as { indirect: number }).indirect += 1;
    }
  }

  return MUSCLES.map((muscle) => {
    const a = acc.get(muscle) as { direct: number; indirect: number; sessions: Set<string> };
    return {
      muscle,
      sets: a.direct + a.indirect * SECONDARY_SET_WEIGHT,
      direct_sets: a.direct,
      indirect_sets: a.indirect,
      sessions: a.sessions.size,
    };
  });
}
