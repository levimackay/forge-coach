import type { Exercise, WorkoutSet } from "@/lib/domain/types";

// Epley loses accuracy past ~12 reps, so reps above this are treated as 12.
export const E1RM_REP_CAP = 12;

export function epley1RM(load: number, reps: number): number | null {
  if (!(load > 0) || !(reps >= 1)) return null;
  // A single is the max itself; the formula would overstate it by 3%.
  if (reps === 1) return load;
  return load * (1 + Math.min(reps, E1RM_REP_CAP) / 30);
}

/**
 * The weight the lifter actually moved. External: the bar. Bodyweight: bodyweight plus any
 * added load. Assisted: bodyweight minus the assistance. Null when it cannot be known
 * (bodyweight exercise and no bodyweight logged), so callers fall back to rep-based metrics.
 */
export function effectiveLoad(
  exercise: Pick<Exercise, "load_type">,
  load: number | null,
  bodyweight: number | null,
): number | null {
  if (exercise.load_type === "external") return load !== null && load > 0 ? load : null;
  if (bodyweight === null || !(bodyweight > 0)) return null;
  const extra = load !== null && load > 0 ? load : 0;
  if (exercise.load_type === "bodyweight") return bodyweight + extra;
  const net = bodyweight - extra;
  return net > 0 ? net : null;
}

export function setE1rm(
  set: Pick<WorkoutSet, "reps" | "load">,
  exercise: Pick<Exercise, "load_type">,
  bodyweight: number | null,
): number | null {
  const load = effectiveLoad(exercise, set.load, bodyweight);
  return load === null ? null : epley1RM(load, set.reps);
}
