export type Uuid = string;
export type IsoDateTime = string;
export type IsoDate = string;

export type Unit = "lb" | "kg";

export type EquipmentCode =
  | "bodyweight"
  | "pullup_bar"
  | "dip_bars"
  | "rings"
  | "dumbbells"
  | "bands"
  | "kettlebells"
  | "barbell"
  | "rack"
  | "bench"
  | "cable"
  | "machines";

export type MovementPattern =
  | "horizontal_push"
  | "vertical_push"
  | "horizontal_pull"
  | "vertical_pull"
  | "squat"
  | "hinge"
  | "lunge"
  | "elbow_flexion"
  | "elbow_extension"
  | "shoulder_isolation"
  | "chest_isolation"
  | "calf"
  | "core";

export type Muscle =
  | "chest"
  | "front_delts"
  | "side_delts"
  | "rear_delts"
  | "triceps"
  | "biceps"
  | "forearms"
  | "lats"
  | "upper_back"
  | "traps"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "calves"
  | "abs";

export type LoadType = "bodyweight" | "external" | "assisted";

export type DayFocus = "push" | "pull" | "legs" | "upper" | "lower" | "full";

interface Synced {
  id: Uuid;
  user_id: Uuid;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
  server_updated_at?: IsoDateTime;
  deleted_at: IsoDateTime | null;
}

export interface Profile {
  user_id: Uuid;
  display_name: string | null;
  unit: Unit;
  bodyweight: number | null;
  timezone: string;
  onboarded_at: IsoDateTime | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
  server_updated_at?: IsoDateTime;
}

export interface Goal extends Synced {
  kind: "hypertrophy" | "strength" | "skill" | "body_composition" | "other";
  description: string;
  focus_muscles: Muscle[];
  target_date: IsoDate | null;
  active: boolean;
}

export interface EquipmentProfile extends Synced {
  name: string;
  equipment: EquipmentCode[];
  dumbbell_increment: number | null;
  dumbbell_max: number | null;
  barbell_increment: number | null;
  is_default: boolean;
}

export interface Exercise {
  id: Uuid;
  user_id: Uuid | null;
  slug: string;
  name: string;
  primary_muscle: Muscle;
  secondary_muscles: Muscle[];
  movement_pattern: MovementPattern;
  equipment: EquipmentCode[];
  load_type: LoadType;
  progression_group: string | null;
  ladder_level: number | null;
  default_rep_min: number;
  default_rep_max: number;
  default_increment: number | null;
  notes: string | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
  server_updated_at?: IsoDateTime;
  deleted_at: IsoDateTime | null;
}

export interface Program extends Synced {
  name: string;
  split: "ppl" | "upper_lower" | "full_body" | "custom";
  days_per_week: number;
  is_active: boolean;
  version: number;
  notes: string | null;
}

export interface ProgramDay extends Synced {
  program_id: Uuid;
  position: number;
  name: string;
  focus: DayFocus;
  equipment_profile_id: Uuid | null;
}

export interface PlannedExercise extends Synced {
  program_day_id: Uuid;
  position: number;
  exercise_id: Uuid;
  sets: number;
  rep_min: number;
  rep_max: number;
  target_rir: number;
  load: number | null;
  rest_seconds: number | null;
  notes: string | null;
  is_active: boolean;
}

export type WorkoutStatus = "in_progress" | "completed" | "abandoned";

export interface Workout extends Synced {
  program_day_id: Uuid | null;
  equipment_profile_id: Uuid | null;
  started_at: IsoDateTime;
  completed_at: IsoDateTime | null;
  status: WorkoutStatus;
  session_rpe: number | null;
  notes: string | null;
}

export interface WorkoutSet extends Synced {
  workout_id: Uuid;
  planned_exercise_id: Uuid | null;
  exercise_id: Uuid;
  set_index: number;
  reps: number;
  load: number | null;
  rir: number | null;
  is_warmup: boolean;
  pain: boolean;
  completed_at: IsoDateTime;
  notes: string | null;
}

export interface RecoveryLog extends Synced {
  date: IsoDate;
  sleep_hours: number | null;
  sleep_quality: number | null;
  soreness: number | null;
  energy: number | null;
  stress: number | null;
  notes: string | null;
}

export interface BodyMeasurement extends Synced {
  measured_on: IsoDate;
  bodyweight: number | null;
  waist: number | null;
  chest: number | null;
  arm: number | null;
  thigh: number | null;
  body_fat_pct: number | null;
  notes: string | null;
}

export type ProgressionAction =
  | "increase_load"
  | "increase_reps"
  | "hold"
  | "advance_variation"
  | "regress_variation"
  | "deload"
  | "reduce_after_gap"
  | "pain_hold"
  | "substitute_equipment";

export interface ProgressionDecision extends Synced {
  planned_exercise_id: Uuid;
  workout_id: Uuid | null;
  decided_at: IsoDateTime;
  engine_version: string;
  action: ProgressionAction;
  before: PrescriptionSnapshot;
  after: PrescriptionSnapshot;
  reason: string;
  inputs: Record<string, unknown>;
}

export interface PrescriptionSnapshot {
  exercise_id: Uuid;
  sets: number;
  rep_min: number;
  rep_max: number;
  target_rir: number;
  load: number | null;
}

export type ProposalStatus = "pending" | "approved" | "rejected" | "applied" | "undone";

export type ProposalChange =
  | {
      op: "update_prescription";
      planned_exercise_id: Uuid;
      set: Partial<Pick<PlannedExercise, "sets" | "rep_min" | "rep_max" | "target_rir" | "load" | "rest_seconds" | "notes">>;
    }
  | { op: "swap_exercise"; planned_exercise_id: Uuid; exercise_id: Uuid }
  | {
      op: "add_exercise";
      program_day_id: Uuid;
      exercise_id: Uuid;
      position: number;
      sets: number;
      rep_min: number;
      rep_max: number;
      target_rir: number;
      load: number | null;
    }
  | { op: "remove_exercise"; planned_exercise_id: Uuid }
  | { op: "update_day"; program_day_id: Uuid; set: Partial<Pick<ProgramDay, "name" | "focus" | "equipment_profile_id">> };

export type InverseChange = ProposalChange | { op: "restore_exercise"; planned_exercise_id: Uuid };

export interface CoachProposal {
  id: Uuid;
  user_id: Uuid;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
  server_updated_at?: IsoDateTime;
  source: "claude" | "user";
  client_id: string | null;
  program_id: Uuid;
  base_program_version: number;
  title: string;
  rationale: string;
  changes: ProposalChange[];
  inverse_changes: InverseChange[] | null;
  status: ProposalStatus;
  decided_at: IsoDateTime | null;
  applied_at: IsoDateTime | null;
  undone_at: IsoDateTime | null;
  decision_note: string | null;
}

export interface AuditEntry {
  id: Uuid;
  user_id: Uuid;
  at: IsoDateTime;
  actor: "user" | "engine" | "claude" | "system";
  client_id: string | null;
  action: string;
  entity: string;
  entity_id: Uuid | null;
  details: Record<string, unknown>;
}

export const SYNCED_TABLES = [
  "profiles",
  "goals",
  "equipment_profiles",
  "exercises",
  "programs",
  "program_days",
  "planned_exercises",
  "workouts",
  "workout_sets",
  "recovery_logs",
  "body_measurements",
  "progression_decisions",
] as const;

export type SyncedTable = (typeof SYNCED_TABLES)[number];

export const READ_ONLY_SYNCED_TABLES = ["coach_proposals", "audit_log"] as const;

export interface TableRowMap {
  profiles: Profile;
  goals: Goal;
  equipment_profiles: EquipmentProfile;
  exercises: Exercise;
  programs: Program;
  program_days: ProgramDay;
  planned_exercises: PlannedExercise;
  workouts: Workout;
  workout_sets: WorkoutSet;
  recovery_logs: RecoveryLog;
  body_measurements: BodyMeasurement;
  progression_decisions: ProgressionDecision;
  coach_proposals: CoachProposal;
  audit_log: AuditEntry;
}

export const EXPORT_FORMAT_VERSION = 1;

export interface ForgeExport {
  format: "forge-coach-export";
  version: typeof EXPORT_FORMAT_VERSION;
  exported_at: IsoDateTime;
  user_id: Uuid;
  tables: { [K in keyof TableRowMap]?: TableRowMap[K][] };
}
