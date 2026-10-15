import type { PlannedExercise, ProgressionDecision, Workout } from "@/lib/domain/types";
import { consistencyFromWorkouts, decideNext, decisionToWrites, plannedSessionsLast28d, sessionsFromRows } from "@/lib/engine";
import type { DecisionWrites } from "@/lib/engine";
import { localDateDaysAgo } from "./dates";
import { getDb } from "./db";
import { deterministicUuid } from "./ids";
import { putRows } from "./write";

const RECOVERY_LOOKBACK_DAYS = 14;

export interface CompleteWorkoutOptions {
  session_rpe?: number | null;
  notes?: string | null;
  /** Injected so history can be replayed deterministically. Defaults to the current time. */
  now?: Date;
}

export interface CompleteWorkoutResult {
  workout: Workout;
  decisions: ProgressionDecision[];
}

/**
 * Marks the workout completed and runs the progression engine for every planned
 * exercise that was trained. Everything is written locally in one transaction,
 * so it works offline and the sync layer carries it to the server later.
 */
export async function completeWorkout(
  workoutId: string,
  options: CompleteWorkoutOptions = {},
): Promise<CompleteWorkoutResult> {
  const db = getDb();
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();

  return db.transaction(
    "rw",
    [
      db.workouts,
      db.workout_sets,
      db.planned_exercises,
      db.program_days,
      db.programs,
      db.exercises,
      db.recovery_logs,
      db.equipment_profiles,
      db.profiles,
      db.progression_decisions,
      db.outbox,
    ],
    async (): Promise<CompleteWorkoutResult> => {
      const workout = await db.workouts.get(workoutId);
      if (!workout || workout.deleted_at) throw new Error("Workout not found.");

      if (workout.status === "completed") {
        const existing = await db.progression_decisions.where("workout_id").equals(workoutId).toArray();
        return { workout, decisions: existing };
      }

      const [completed] = await putRows("workouts", [
        {
          ...workout,
          status: "completed",
          completed_at: nowIso,
          session_rpe: options.session_rpe ?? workout.session_rpe,
          notes: options.notes ?? workout.notes,
        },
      ]);

      if (!workout.program_day_id) return { workout: completed, decisions: [] };
      const day = await db.program_days.get(workout.program_day_id);
      if (!day) return { workout: completed, decisions: [] };

      const [program, siblingDays, planned, library, allWorkouts, profile, equipmentRows, recoveryRows] =
        await Promise.all([
          db.programs.get(day.program_id),
          db.program_days.where("program_id").equals(day.program_id).filter((d) => !d.deleted_at).toArray(),
          db.planned_exercises
            .where("program_day_id")
            .equals(day.id)
            .filter((p) => p.is_active && !p.deleted_at)
            .toArray(),
          db.exercises.filter((e) => !e.deleted_at).toArray(),
          db.workouts.filter((w) => !w.deleted_at).toArray(),
          db.profiles.toCollection().first(),
          db.equipment_profiles.filter((e) => !e.deleted_at).toArray(),
          db.recovery_logs
            .where("date")
            .aboveOrEqual(localDateDaysAgo(RECOVERY_LOOKBACK_DAYS, now))
            .filter((r) => !r.deleted_at)
            .toArray(),
        ]);

      const workouts = allWorkouts.map((w) => (w.id === completed.id ? completed : w));
      const equipmentId = workout.equipment_profile_id ?? day.equipment_profile_id;
      const equipment =
        equipmentRows.find((e) => e.id === equipmentId) ?? equipmentRows.find((e) => e.is_default) ?? null;
      const plannedLast28d = plannedSessionsLast28d(
        program?.days_per_week ?? Math.max(1, siblingDays.length),
        siblingDays.length,
        program?.created_at ?? null,
        nowIso,
      );
      const consistency = consistencyFromWorkouts(workouts, day.id, nowIso, plannedLast28d);
      const exerciseById = new Map(library.map((e) => [e.id, e]));
      const thisSessionSets = await db.workout_sets.where("workout_id").equals(workoutId).toArray();

      const decisionRows: (DecisionWrites["decisionRow"] & { id: string })[] = [];
      const planUpdates: PlannedExercise[] = [];

      for (const pe of planned) {
        // Warmups alone are not a session of the exercise; the engine still sees their pain flags later.
        const trained = thisSessionSets.some((s) => s.planned_exercise_id === pe.id && !s.deleted_at && !s.is_warmup);
        const exercise = exerciseById.get(pe.exercise_id);
        if (!trained || !exercise) continue;

        const sets = await db.workout_sets.where("planned_exercise_id").equals(pe.id).toArray();
        const decision = decideNext({
          planned: pe,
          exercise,
          library,
          history: sessionsFromRows(workouts, sets, pe.id),
          recovery: recoveryRows,
          equipment,
          consistency,
          unit: profile?.unit ?? "lb",
          bodyweight: profile?.bodyweight ?? null,
          now: nowIso,
        });

        const writes = decisionToWrites(decision, {
          planned_exercise_id: pe.id,
          workout_id: workoutId,
          decided_at: nowIso,
        });
        // Same workout and exercise always map to the same row, so a retry or a second
        // device cannot record the decision twice.
        decisionRows.push({ id: deterministicUuid(`decision:${workoutId}:${pe.id}`), ...writes.decisionRow });
        if (Object.keys(writes.plannedPatch).length) planUpdates.push({ ...pe, ...writes.plannedPatch });
      }

      const decisions = await putRows("progression_decisions", decisionRows);
      if (planUpdates.length) await putRows("planned_exercises", planUpdates);
      return { workout: completed, decisions };
    },
  );
}
