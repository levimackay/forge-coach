import type {
  Exercise,
  IsoDateTime,
  PlannedExercise,
  PrescriptionSnapshot,
  ProgramDay,
  ProgressionDecision,
  RecoveryLog,
  Unit,
  Uuid,
} from "@/lib/domain/types";
import { ENGINE_VERSION } from "./config";
import { decideNext, repCeiling } from "./decide";
import { consistencyFromWorkouts, sessionsFromRows, type SetRow, type WorkoutRow } from "./history";
import type { EngineDecision, EquipmentLike } from "./types";

export interface PlanHistory {
  workouts: WorkoutRow[];
  sets: SetRow[];
}

export interface SessionPlanItem {
  planned: PlannedExercise;
  // The exercise to actually do. Differs from the planned one when the engine
  // swapped it for the equipment at hand.
  exercise: Exercise;
  decision: EngineDecision;
  prescription: PrescriptionSnapshot;
  // Rep count at which the next load or variation step is taken.
  rep_ceiling: number;
  changed: boolean;
}

export interface NextSessionOptions {
  unit: Unit;
  // Sessions of this day the program called for in the last 28 days. Only the caller knows it; 0 turns the adherence check off.
  plannedSessions28d?: number;
  // The athlete's bodyweight in `unit`, when known.
  bodyweight?: number | null;
}

type PatchKey = "exercise_id" | "sets" | "rep_min" | "rep_max" | "target_rir" | "load";
const PATCH_KEYS: PatchKey[] = ["exercise_id", "sets", "rep_min", "rep_max", "target_rir", "load"];

// Adjusted prescriptions for the upcoming session of one program day, in plan
// order. Planned exercises whose exercise is missing from the library are left out.
export function nextSessionPlan(
  day: ProgramDay,
  plannedExercises: PlannedExercise[],
  library: Exercise[],
  history: PlanHistory,
  recovery: RecoveryLog[],
  equipment: EquipmentLike | null,
  now: IsoDateTime,
  options: NextSessionOptions,
): SessionPlanItem[] {
  const byId = new Map(library.map((e) => [e.id, e]));
  const consistency = consistencyFromWorkouts(history.workouts, day.id, now, options.plannedSessions28d ?? 0);
  return plannedExercises
    .filter((p) => p.program_day_id === day.id && p.is_active && !p.deleted_at)
    .sort((a, b) => a.position - b.position)
    .flatMap((planned): SessionPlanItem[] => {
      const exercise = byId.get(planned.exercise_id);
      if (!exercise) return [];
      const decision = decideNext({
        planned,
        exercise,
        library,
        history: sessionsFromRows(history.workouts, history.sets, planned.id),
        recovery,
        equipment,
        consistency,
        unit: options.unit,
        bodyweight: options.bodyweight,
        now,
      });
      const doing = byId.get(decision.after.exercise_id) ?? exercise;
      return [
        {
          planned,
          exercise: doing,
          decision,
          prescription: decision.after,
          rep_ceiling: repCeiling({
            exercise: doing,
            library,
            equipment,
            unit: options.unit,
            load: decision.after.load,
            rep_max: decision.after.rep_max,
            bodyweight: options.bodyweight,
          }),
          changed: PATCH_KEYS.some((k) => decision.before[k] !== decision.after[k]),
        },
      ];
    });
}

export interface DecisionWrites {
  plannedPatch: Partial<Pick<PlannedExercise, PatchKey>>;
  decisionRow: Pick<
    ProgressionDecision,
    "planned_exercise_id" | "workout_id" | "decided_at" | "engine_version" | "action" | "before" | "after" | "reason" | "inputs"
  >;
}

// What to persist for a decision: the fields of the planned exercise that
// actually change, and the progression_decisions row (the caller adds id,
// user_id and timestamps). An equipment swap only applies to the session at
// hand, so it never rewrites the planned exercise.
export function decisionToWrites(
  decision: EngineDecision,
  ctx: { planned_exercise_id: Uuid; workout_id: Uuid | null; decided_at: IsoDateTime },
): DecisionWrites {
  const plannedPatch: Record<string, unknown> = {};
  if (decision.action !== "substitute_equipment") {
    for (const k of PATCH_KEYS) if (decision.before[k] !== decision.after[k]) plannedPatch[k] = decision.after[k];
  }
  return {
    plannedPatch: plannedPatch as DecisionWrites["plannedPatch"],
    decisionRow: {
      planned_exercise_id: ctx.planned_exercise_id,
      workout_id: ctx.workout_id,
      decided_at: ctx.decided_at,
      engine_version: ENGINE_VERSION,
      action: decision.action,
      before: decision.before,
      after: decision.after,
      reason: decision.reason,
      inputs: decision.inputs,
    },
  };
}
