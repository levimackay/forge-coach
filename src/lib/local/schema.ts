import { z } from "zod";
import {
  EXPORT_FORMAT_VERSION,
  type AuditEntry,
  type BodyMeasurement,
  type CoachProposal,
  type EquipmentProfile,
  type Exercise,
  type ForgeExport,
  type Goal,
  type PlannedExercise,
  type Profile,
  type Program,
  type ProgramDay,
  type ProgressionDecision,
  type RecoveryLog,
  type Workout,
  type WorkoutSet,
} from "@/lib/domain/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uuid = z.string().regex(UUID_RE, "Expected a UUID");
const ts = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Expected a timestamp");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const text = z.string().max(5000);
const int = (min: number, max: number) => z.number().int().min(min).max(max);
const nonNegative = z.number().min(0).max(100_000);

const unit = z.enum(["lb", "kg"]);
const equipmentCode = z.enum([
  "bodyweight",
  "pullup_bar",
  "dip_bars",
  "rings",
  "dumbbells",
  "bands",
  "kettlebells",
  "barbell",
  "rack",
  "bench",
  "cable",
  "machines",
]);
const muscle = z.enum([
  "chest",
  "front_delts",
  "side_delts",
  "rear_delts",
  "triceps",
  "biceps",
  "forearms",
  "lats",
  "upper_back",
  "traps",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "abs",
]);
const movementPattern = z.enum([
  "horizontal_push",
  "vertical_push",
  "horizontal_pull",
  "vertical_pull",
  "squat",
  "hinge",
  "lunge",
  "elbow_flexion",
  "elbow_extension",
  "shoulder_isolation",
  "chest_isolation",
  "calf",
  "core",
]);
const dayFocus = z.enum(["push", "pull", "legs", "upper", "lower", "full"]);
const rating = int(1, 5).nullable();

const synced = {
  id: uuid,
  user_id: uuid,
  created_at: ts,
  updated_at: ts,
  server_updated_at: ts.optional(),
  deleted_at: ts.nullable(),
};

const snapshot = z.object({
  exercise_id: uuid,
  sets: int(1, 20),
  rep_min: int(0, 1000),
  rep_max: int(0, 1000),
  target_rir: int(0, 10),
  load: nonNegative.nullable(),
});

export const profileSchema: z.ZodType<Profile> = z.object({
  user_id: uuid,
  display_name: z.string().max(100).nullable(),
  unit,
  bodyweight: nonNegative.nullable(),
  timezone: z.string().max(100),
  onboarded_at: ts.nullable(),
  created_at: ts,
  updated_at: ts,
  server_updated_at: ts.optional(),
});

export const goalSchema: z.ZodType<Goal> = z.object({
  ...synced,
  kind: z.enum(["hypertrophy", "strength", "skill", "body_composition", "other"]),
  description: text,
  focus_muscles: z.array(muscle).max(15),
  target_date: day.nullable(),
  active: z.boolean(),
});

export const equipmentProfileSchema: z.ZodType<EquipmentProfile> = z.object({
  ...synced,
  name: z.string().max(100),
  equipment: z.array(equipmentCode).max(12),
  dumbbell_increment: nonNegative.nullable(),
  dumbbell_max: nonNegative.nullable(),
  barbell_increment: nonNegative.nullable(),
  is_default: z.boolean(),
});

export const exerciseSchema: z.ZodType<Exercise> = z.object({
  id: uuid,
  user_id: uuid.nullable(),
  slug: z.string().max(100),
  name: z.string().max(200),
  primary_muscle: muscle,
  secondary_muscles: z.array(muscle).max(15),
  movement_pattern: movementPattern,
  equipment: z.array(equipmentCode).max(12),
  load_type: z.enum(["bodyweight", "external", "assisted"]),
  progression_group: z.string().max(100).nullable(),
  ladder_level: int(0, 100).nullable(),
  default_rep_min: int(0, 1000),
  default_rep_max: int(0, 1000),
  default_increment: nonNegative.nullable(),
  notes: text.nullable(),
  created_at: ts,
  updated_at: ts,
  server_updated_at: ts.optional(),
  deleted_at: ts.nullable(),
});

export const programSchema: z.ZodType<Program> = z.object({
  ...synced,
  name: z.string().max(200),
  split: z.enum(["ppl", "upper_lower", "full_body", "custom"]),
  days_per_week: int(1, 7),
  is_active: z.boolean(),
  version: int(0, 1_000_000),
  notes: text.nullable(),
});

export const programDaySchema: z.ZodType<ProgramDay> = z.object({
  ...synced,
  program_id: uuid,
  position: int(0, 100),
  name: z.string().max(200),
  focus: dayFocus,
  equipment_profile_id: uuid.nullable(),
});

export const plannedExerciseSchema: z.ZodType<PlannedExercise> = z
  .object({
    ...synced,
    program_day_id: uuid,
    position: int(0, 100),
    exercise_id: uuid,
    sets: int(1, 20),
    rep_min: int(0, 1000),
    rep_max: int(0, 1000),
    target_rir: int(0, 10),
    load: nonNegative.nullable(),
    rest_seconds: int(0, 3600).nullable(),
    notes: text.nullable(),
    is_active: z.boolean(),
  })
  .refine((p) => p.rep_min <= p.rep_max, "rep_min must not exceed rep_max");

export const workoutSchema: z.ZodType<Workout> = z.object({
  ...synced,
  program_day_id: uuid.nullable(),
  equipment_profile_id: uuid.nullable(),
  started_at: ts,
  completed_at: ts.nullable(),
  status: z.enum(["in_progress", "completed", "abandoned"]),
  session_rpe: int(1, 10).nullable(),
  notes: text.nullable(),
});

export const workoutSetSchema: z.ZodType<WorkoutSet> = z.object({
  ...synced,
  workout_id: uuid,
  planned_exercise_id: uuid.nullable(),
  exercise_id: uuid,
  set_index: int(0, 1000),
  reps: int(0, 1000),
  load: nonNegative.nullable(),
  rir: int(0, 10).nullable(),
  is_warmup: z.boolean(),
  pain: z.boolean(),
  completed_at: ts,
  notes: text.nullable(),
});

export const recoveryLogSchema: z.ZodType<RecoveryLog> = z.object({
  ...synced,
  date: day,
  sleep_hours: z.number().min(0).max(24).nullable(),
  sleep_quality: rating,
  soreness: rating,
  energy: rating,
  stress: rating,
  notes: text.nullable(),
});

export const bodyMeasurementSchema: z.ZodType<BodyMeasurement> = z.object({
  ...synced,
  measured_on: day,
  bodyweight: nonNegative.nullable(),
  waist: nonNegative.nullable(),
  chest: nonNegative.nullable(),
  arm: nonNegative.nullable(),
  thigh: nonNegative.nullable(),
  body_fat_pct: z.number().min(0).max(100).nullable(),
  notes: text.nullable(),
});

export const progressionDecisionSchema: z.ZodType<ProgressionDecision> = z.object({
  ...synced,
  planned_exercise_id: uuid,
  workout_id: uuid.nullable(),
  decided_at: ts,
  engine_version: z.string().max(50),
  action: z.enum([
    "increase_load",
    "increase_reps",
    "hold",
    "advance_variation",
    "regress_variation",
    "deload",
    "reduce_after_gap",
    "pain_hold",
    "substitute_equipment",
  ]),
  before: snapshot,
  after: snapshot,
  reason: text,
  inputs: z.record(z.string(), z.unknown()),
});

const op = z.array(z.record(z.string(), z.unknown()));

// Proposals and the audit log are server-owned caches. They are validated
// loosely because import never writes them back.
export const coachProposalSchema = z.object({
  id: uuid,
  user_id: uuid,
  created_at: ts,
  updated_at: ts,
  server_updated_at: ts.optional(),
  source: z.enum(["claude", "user"]),
  client_id: z.string().nullable(),
  program_id: uuid,
  base_program_version: int(0, 1_000_000),
  title: z.string().max(500),
  rationale: z.string().max(20_000),
  changes: op,
  inverse_changes: op.nullable(),
  status: z.enum(["pending", "approved", "rejected", "applied", "undone"]),
  decided_at: ts.nullable(),
  applied_at: ts.nullable(),
  undone_at: ts.nullable(),
  decision_note: text.nullable(),
}) as unknown as z.ZodType<CoachProposal>;

export const auditEntrySchema: z.ZodType<AuditEntry> = z.object({
  id: uuid,
  user_id: uuid,
  at: ts,
  actor: z.enum(["user", "engine", "claude", "system"]),
  client_id: z.string().nullable(),
  action: z.string().max(200),
  entity: z.string().max(200),
  entity_id: uuid.nullable(),
  details: z.record(z.string(), z.unknown()),
});

export const forgeExportSchema: z.ZodType<ForgeExport> = z.object({
  format: z.literal("forge-coach-export"),
  version: z.literal(EXPORT_FORMAT_VERSION),
  exported_at: ts,
  user_id: uuid,
  tables: z.object({
    profiles: z.array(profileSchema).optional(),
    goals: z.array(goalSchema).optional(),
    equipment_profiles: z.array(equipmentProfileSchema).optional(),
    exercises: z.array(exerciseSchema).optional(),
    programs: z.array(programSchema).optional(),
    program_days: z.array(programDaySchema).optional(),
    planned_exercises: z.array(plannedExerciseSchema).optional(),
    workouts: z.array(workoutSchema).optional(),
    workout_sets: z.array(workoutSetSchema).optional(),
    recovery_logs: z.array(recoveryLogSchema).optional(),
    body_measurements: z.array(bodyMeasurementSchema).optional(),
    progression_decisions: z.array(progressionDecisionSchema).optional(),
    coach_proposals: z.array(coachProposalSchema).optional(),
    audit_log: z.array(auditEntrySchema).optional(),
  }),
});
