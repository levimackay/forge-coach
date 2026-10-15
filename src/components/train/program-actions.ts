import type { Exercise, PlannedExercise } from "@/lib/domain/types";
import { getDb } from "@/lib/local/db";
import { putRow, putRows } from "@/lib/local/write";

export const MAX_SETS = 20;
export const MAX_REPS = 100;
export const MAX_RIR = 10;
export const MAX_REST_SECONDS = 3600;
export const NEW_EXERCISE_SETS = 3;
export const NEW_EXERCISE_RIR = 2;
export const NEW_EXERCISE_REST_SECONDS = 90;

export interface PlannedEdit {
  sets: number;
  rep_min: number;
  rep_max: number;
  target_rir: number;
  load: number | null;
  rest_seconds: number | null;
}

/** Keeps the lower rep bound at or under the upper one, which the database requires. */
export function clampReps(change: { rep_min?: number; rep_max?: number }, current: { rep_min: number; rep_max: number }) {
  let min = change.rep_min ?? current.rep_min;
  let max = change.rep_max ?? current.rep_max;
  if (change.rep_min !== undefined && min > max) max = min;
  if (change.rep_max !== undefined && max < min) min = max;
  return { rep_min: min, rep_max: max };
}

export function savePlannedEdit(planned: PlannedExercise, edit: PlannedEdit): Promise<PlannedExercise> {
  return putRow("planned_exercises", { ...planned, ...edit });
}

/** A load belongs to its exercise, so a swap starts with no load and the new exercise's rep range. */
export function swapPlannedExercise(planned: PlannedExercise, exercise: Exercise): Promise<PlannedExercise> {
  return putRow("planned_exercises", {
    ...planned,
    exercise_id: exercise.id,
    rep_min: exercise.default_rep_min,
    rep_max: exercise.default_rep_max,
    load: null,
  });
}

/** Removal never deletes the row, because logged sets still point at it. */
export const setPlannedActive = (planned: PlannedExercise, active: boolean): Promise<PlannedExercise> =>
  putRow("planned_exercises", { ...planned, is_active: active });

export async function addPlannedExercise(args: {
  programDayId: string;
  exercise: Exercise;
}): Promise<PlannedExercise> {
  const db = getDb();
  return db.transaction("rw", db.planned_exercises, db.outbox, async () => {
    const existing = await db.planned_exercises
      .where("program_day_id")
      .equals(args.programDayId)
      .filter((p) => !p.deleted_at)
      .toArray();
    const position = existing.length ? Math.max(...existing.map((p) => p.position)) + 1 : 0;
    return putRow("planned_exercises", {
      program_day_id: args.programDayId,
      position,
      exercise_id: args.exercise.id,
      sets: NEW_EXERCISE_SETS,
      rep_min: args.exercise.default_rep_min,
      rep_max: args.exercise.default_rep_max,
      target_rir: NEW_EXERCISE_RIR,
      load: null,
      rest_seconds: NEW_EXERCISE_REST_SECONDS,
      notes: null,
      is_active: true,
    });
  });
}

/**
 * New positions after moving one item by `delta` places. Returns only the rows whose
 * position changed, numbered 0..n-1 so duplicate or gapped positions get cleaned up.
 */
export function reorder<T extends Pick<PlannedExercise, "id" | "position">>(
  items: T[],
  id: string,
  delta: -1 | 1,
): { id: string; position: number }[] {
  const ordered = [...items].sort((a, b) => a.position - b.position);
  const from = ordered.findIndex((p) => p.id === id);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= ordered.length) return [];
  const [moved] = ordered.splice(from, 1);
  ordered.splice(to, 0, moved);
  return ordered.flatMap((p, position) => (p.position === position ? [] : [{ id: p.id, position }]));
}

export async function movePlannedExercise(day: PlannedExercise[], id: string, delta: -1 | 1): Promise<void> {
  const changes = reorder(day, id, delta);
  if (changes.length === 0) return;
  const byId = new Map(day.map((p) => [p.id, p]));
  await putRows(
    "planned_exercises",
    changes.map((c) => ({ ...(byId.get(c.id) as PlannedExercise), position: c.position })),
  );
}
