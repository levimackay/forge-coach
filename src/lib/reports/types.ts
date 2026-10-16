import type {
  BodyMeasurement,
  DayFocus,
  EquipmentCode,
  EquipmentProfile,
  Exercise,
  Goal,
  IsoDate,
  IsoDateTime,
  LoadType,
  Muscle,
  PlannedExercise,
  Profile,
  Program,
  ProgramDay,
  ProgressionDecision,
  RecoveryLog,
  Unit,
  Uuid,
  WorkoutSet,
  Workout,
  WorkoutStatus,
} from "@/lib/domain/types";
import type {
  BodyweightTrend,
  Consistency,
  DecisionDigest,
  Delta,
  MuscleVolume,
  RecoverySummary,
  ResolvedBodyweight,
  SeriesPoint,
} from "../analytics";

export const REPORT_FORMAT_VERSION = 1;

export type ReportKind = "session" | "week" | "month";

/**
 * Everything a report reads. Field names are the table names, so the UI and the MCP server
 * can fill it straight from their rows. Soft-deleted rows are ignored. Pass the athlete's
 * whole history: period figures and "new best" checks look back past the period.
 */
export interface ReportData {
  profile: Profile | null;
  goals: Goal[];
  equipment_profiles: EquipmentProfile[];
  /** The active program, if any. */
  program: Program | null;
  program_days: ProgramDay[];
  planned_exercises: PlannedExercise[];
  /** The exercise library plus custom exercises. */
  exercises: Exercise[];
  workouts: Workout[];
  workout_sets: WorkoutSet[];
  recovery_logs: RecoveryLog[];
  body_measurements: BodyMeasurement[];
  progression_decisions: ProgressionDecision[];
}

export interface ReportInput {
  kind: ReportKind;
  data: ReportData;
  now: IsoDateTime;
  unit: Unit;
  /** Session reports only. Defaults to the newest completed workout. */
  workoutId?: Uuid;
}

export interface ReportGoal {
  kind: Goal["kind"];
  description: string;
  focus_muscles: Muscle[];
  target_date: IsoDate | null;
}

export interface ReportEquipment {
  name: string;
  is_default: boolean;
  equipment: EquipmentCode[];
  dumbbell_increment: number | null;
  dumbbell_max: number | null;
  barbell_increment: number | null;
}

export interface ReportPrescription {
  name: string;
  sets: number;
  rep_min: number;
  rep_max: number;
  target_rir: number;
  load: number | null;
}

export interface ReportProgram {
  name: string;
  split: Program["split"];
  days_per_week: number;
  version: number;
  days: { name: string; focus: DayFocus; exercises: ReportPrescription[] }[];
}

export interface ReportSessionSummary {
  workout_id: Uuid;
  date: IsoDate;
  day_name: string | null;
  focus: DayFocus | null;
  duration_minutes: number | null;
  exercises: number;
  work_sets: number;
  session_rpe: number | null;
}

export interface ReportSessionSet {
  set_index: number;
  reps: number;
  load: number | null;
  rir: number | null;
  is_warmup: boolean;
  pain: boolean;
}

export interface ReportSessionExercise {
  exercise_id: Uuid;
  name: string;
  load_type: LoadType;
  planned: Omit<ReportPrescription, "name"> | null;
  sets: ReportSessionSet[];
  /** This session's work sets. */
  summary: SeriesPoint | null;
  /** The last earlier completed session that included the exercise. */
  previous: SeriesPoint | null;
  vs_previous: Delta | null;
  /** Latest sessions of this day's focus that included the exercise, oldest first. */
  recent_same_day: SeriesPoint[];
}

export interface ReportSessionDetail {
  workout_id: Uuid;
  date: IsoDate;
  status: WorkoutStatus;
  day_name: string | null;
  focus: DayFocus | null;
  duration_minutes: number | null;
  session_rpe: number | null;
  notes: string | null;
  recovery_that_day: NonNullable<RecoverySummary["latest"]> | null;
  exercises: ReportSessionExercise[];
}

export interface ReportExercise {
  exercise_id: Uuid;
  name: string;
  load_type: LoadType;
  primary_muscle: Muscle;
  /** Sessions inside the period, oldest first. */
  sessions: SeriesPoint[];
  first_to_last: Delta | null;
  period_best_e1rm: number | null;
  /** Best e1RM from before the period. */
  previous_best_e1rm: number | null;
  /** Period best beat the previous best. False when there is nothing to beat. */
  is_pr: boolean;
}

export interface ReportPainFlag {
  date: IsoDate;
  workout_id: Uuid;
  exercise: string;
  load_type: LoadType;
  reps: number;
  load: number | null;
  is_warmup: boolean;
}

export interface ReportJson {
  format: "forge-coach-report";
  version: typeof REPORT_FORMAT_VERSION;
  kind: ReportKind;
  title: string;
  generated_at: IsoDateTime;
  unit: Unit;
  timezone: string;
  /** Session reports use the 7 days ending on the session date as context. */
  period: { from: IsoDate; to: IsoDate; days: number };
  athlete: {
    display_name: string | null;
    bodyweight: ResolvedBodyweight | null;
    goals: ReportGoal[];
    equipment: ReportEquipment[];
  };
  program: ReportProgram | null;
  sessions: ReportSessionSummary[];
  session_detail: ReportSessionDetail | null;
  consistency: Consistency;
  exercises: ReportExercise[];
  weekly_volume: {
    reference_min: number;
    reference_max: number;
    weeks: { from: IsoDate; to: IsoDate; muscles: MuscleVolume[] }[];
  };
  recovery: RecoverySummary;
  bodyweight_trend: BodyweightTrend;
  decisions: DecisionDigest;
  pain_flags: ReportPainFlag[];
  /** Plain-language list of what could not be computed or was not logged. */
  missing: string[];
}

export interface Report {
  title: string;
  markdown: string;
  json: ReportJson;
}
