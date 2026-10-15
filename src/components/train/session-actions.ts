import type { Exercise, Workout, WorkoutSet } from "@/lib/domain/types";
import { getDb } from "@/lib/local/db";
import { putRow, softDelete } from "@/lib/local/write";
import { draftToRow, nextSetIndex, type SetDraft } from "./workout-model";

/** Starts a workout on a program day. Everything the logger needs is saved before the screen opens. */
export async function startWorkout(args: {
  programDayId: string;
  equipmentProfileId: string | null;
  now?: Date;
}): Promise<Workout> {
  return putRow("workouts", {
    program_day_id: args.programDayId,
    equipment_profile_id: args.equipmentProfileId,
    started_at: (args.now ?? new Date()).toISOString(),
    completed_at: null,
    status: "in_progress",
    session_rpe: null,
    notes: null,
  });
}

/**
 * Saves one set locally. The set's position is read inside the transaction, so two quick
 * taps cannot end up with the same index.
 */
export async function logSet(args: {
  workoutId: string;
  plannedExerciseId: string | null;
  exercise: Exercise;
  draft: SetDraft;
  now?: Date;
}): Promise<WorkoutSet> {
  const db = getDb();
  return db.transaction("rw", db.workout_sets, db.outbox, async () => {
    const mine = await db.workout_sets
      .where("workout_id")
      .equals(args.workoutId)
      .filter((s) => s.planned_exercise_id === args.plannedExerciseId)
      .toArray();
    return putRow(
      "workout_sets",
      draftToRow({
        draft: args.draft,
        exercise: args.exercise,
        workoutId: args.workoutId,
        plannedExerciseId: args.plannedExerciseId,
        setIndex: nextSetIndex(mine),
        completedAt: (args.now ?? new Date()).toISOString(),
      }),
    );
  });
}

export type SetEdit = Pick<SetDraft, "reps" | "load" | "rir" | "warmup" | "pain" | "note">;

/** Edits a logged set in place. Its position and completion time stay as they were. */
export async function saveSetEdit(set: WorkoutSet, edit: SetEdit): Promise<WorkoutSet> {
  const note = edit.note.trim();
  return putRow("workout_sets", {
    ...set,
    reps: edit.reps ?? set.reps,
    load: edit.load,
    rir: edit.warmup ? null : edit.rir,
    is_warmup: edit.warmup,
    pain: edit.pain,
    notes: note === "" ? null : note,
  });
}

export const removeSet = (id: string): Promise<void> => softDelete("workout_sets", id);

/** Brings back a deleted set, for the Undo on the toast. */
export const restoreSet = (set: WorkoutSet): Promise<WorkoutSet> => putRow("workout_sets", { ...set, deleted_at: null });

/** Marks a workout as abandoned. Its sets stay on the device but never feed the engine. */
export function discardWorkout(workout: Workout): Promise<Workout> {
  return putRow("workouts", { ...workout, status: "abandoned" });
}

/** Removes a finished workout and its sets from every list. The plan changes it caused stay. */
export async function deleteWorkout(workoutId: string): Promise<void> {
  const db = getDb();
  const sets = await db.workout_sets.where("workout_id").equals(workoutId).filter((s) => !s.deleted_at).toArray();
  for (const s of sets) await softDelete("workout_sets", s.id);
  await softDelete("workouts", workoutId);
}
