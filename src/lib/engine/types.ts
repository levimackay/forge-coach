import type {
  EquipmentProfile,
  Exercise,
  IsoDateTime,
  PrescriptionSnapshot,
  ProgressionAction,
  RecoveryLog,
  Unit,
  Uuid,
  WorkoutSet,
} from "@/lib/domain/types";

// A full PlannedExercise is assignable here. `updated_at` lets the engine tell
// whether the prescription was already updated after the newest session.
export type PlannedPrescription = PrescriptionSnapshot & { id?: Uuid; updated_at?: IsoDateTime };

export type EngineSet = Pick<WorkoutSet, "exercise_id" | "set_index" | "reps" | "load" | "rir" | "is_warmup" | "pain">;

export interface SessionHistoryEntry {
  workout_id: Uuid | null;
  completed_at: IsoDateTime;
  sets: EngineSet[];
}

export type EquipmentLike = Pick<
  EquipmentProfile,
  "name" | "equipment" | "dumbbell_increment" | "dumbbell_max" | "barbell_increment"
>;

export type RecoveryEntry = Pick<RecoveryLog, "date" | "sleep_hours" | "soreness"> & {
  deleted_at?: IsoDateTime | null;
};

export interface ConsistencyInfo {
  // Whole days from the newest completed session of this day (one finished a moment ago counts, so 0) to `now`. Null when there is none.
  days_since_last_session: number | null;
  sessions_last_28d: number;
  planned_last_28d: number;
}

export interface EngineInput {
  planned: PlannedPrescription;
  exercise: Exercise;
  // Exercise library used for ladder siblings and equipment substitutes.
  library: Exercise[];
  // Completed sessions of this planned exercise, newest first.
  history: SessionHistoryEntry[];
  recovery: RecoveryEntry[];
  equipment: EquipmentLike | null;
  consistency: ConsistencyInfo;
  unit: Unit;
  // The athlete's bodyweight in `unit`. On assisted work and weighted ladder rungs the
  // load moved is bodyweight minus or plus the logged load, so jump sizes depend on it.
  bodyweight?: number | null;
  now: IsoDateTime;
}

export interface EngineDecision {
  action: ProgressionAction;
  before: PrescriptionSnapshot;
  after: PrescriptionSnapshot;
  // One plain sentence with the real numbers.
  reason: string;
  // JSON-safe facts the decision was based on, stored with the decision row.
  inputs: Record<string, unknown>;
}
