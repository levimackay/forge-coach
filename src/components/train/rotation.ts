import type { ProgramDay, Workout } from "@/lib/domain/types";

type WorkoutLike = Pick<Workout, "program_day_id" | "status" | "started_at" | "completed_at" | "deleted_at">;

const finishedAt = (w: WorkoutLike): number => Date.parse(w.completed_at ?? w.started_at);

/**
 * The next day in the program's rotation: the one after the day of the last
 * completed workout, wrapping around. Workouts from other programs, abandoned
 * ones and the one in progress do not move the rotation.
 */
export function pickNextDay<D extends Pick<ProgramDay, "id" | "position" | "deleted_at">>(
  days: D[],
  workouts: WorkoutLike[],
): D | null {
  const ordered = days.filter((d) => !d.deleted_at).sort((a, b) => a.position - b.position);
  if (ordered.length === 0) return null;
  const byId = new Map(ordered.map((d, i) => [d.id, i]));
  const last = workouts
    .filter((w) => w.status === "completed" && !w.deleted_at && w.program_day_id !== null && byId.has(w.program_day_id))
    .sort((a, b) => finishedAt(b) - finishedAt(a))[0];
  if (!last || last.program_day_id === null) return ordered[0];
  const index = byId.get(last.program_day_id) as number;
  return ordered[(index + 1) % ordered.length];
}

/** The newest workout that was started and never finished. */
export function findInProgress<W extends Pick<Workout, "status" | "started_at" | "deleted_at">>(
  workouts: W[],
): W | null {
  return (
    workouts
      .filter((w) => w.status === "in_progress" && !w.deleted_at)
      .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))[0] ?? null
  );
}
