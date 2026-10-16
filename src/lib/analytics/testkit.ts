import type {
  BodyMeasurement,
  EquipmentProfile,
  Exercise,
  Goal,
  PlannedExercise,
  Profile,
  ProgramDay,
  Program,
  ProgressionDecision,
  RecoveryLog,
  Workout,
  WorkoutSet,
} from "@/lib/domain/types";

// Row factories for tests only. Ids are sequential so failures read well.
let n = 0;
const next = (prefix: string) => `${prefix}-${++n}`;
const STAMP = "2026-01-01T00:00:00.000Z";
export const USER = "user-1";

const base = (prefix: string) => ({
  id: next(prefix),
  user_id: USER,
  created_at: STAMP,
  updated_at: STAMP,
  deleted_at: null,
});

export const exercise = (o: Partial<Exercise> = {}): Exercise => {
  const id = next("ex");
  return {
    id,
    user_id: null,
    slug: id,
    name: id,
    primary_muscle: "chest",
    secondary_muscles: [],
    movement_pattern: "horizontal_push",
    equipment: ["barbell"],
    load_type: "external",
    progression_group: null,
    ladder_level: null,
    default_rep_min: 6,
    default_rep_max: 10,
    default_increment: null,
    notes: null,
    created_at: STAMP,
    updated_at: STAMP,
    deleted_at: null,
    ...o,
  };
};

export const workout = (o: Partial<Workout> = {}): Workout => ({
  ...base("wo"),
  program_day_id: null,
  equipment_profile_id: null,
  started_at: "2026-10-12T23:00:00.000Z",
  completed_at: null,
  status: "completed",
  session_rpe: null,
  notes: null,
  ...o,
});

export const set = (o: Partial<WorkoutSet> & Pick<WorkoutSet, "workout_id" | "exercise_id">): WorkoutSet => ({
  ...base("set"),
  planned_exercise_id: null,
  set_index: 0,
  reps: 8,
  load: null,
  rir: null,
  is_warmup: false,
  pain: false,
  completed_at: STAMP,
  notes: null,
  ...o,
});

export const recovery = (o: Partial<RecoveryLog> & Pick<RecoveryLog, "date">): RecoveryLog => ({
  ...base("rec"),
  sleep_hours: null,
  sleep_quality: null,
  soreness: null,
  energy: null,
  stress: null,
  notes: null,
  ...o,
});

export const measurement = (o: Partial<BodyMeasurement> & Pick<BodyMeasurement, "measured_on">): BodyMeasurement => ({
  ...base("bm"),
  bodyweight: null,
  waist: null,
  chest: null,
  arm: null,
  thigh: null,
  body_fat_pct: null,
  notes: null,
  ...o,
});

export const programDay = (o: Partial<ProgramDay> & Pick<ProgramDay, "program_id">): ProgramDay => ({
  ...base("day"),
  position: 0,
  name: "Push A",
  focus: "push",
  equipment_profile_id: null,
  ...o,
});

export const program = (o: Partial<Program> = {}): Program => ({
  ...base("prog"),
  name: "PPL",
  split: "ppl",
  days_per_week: 3,
  is_active: true,
  version: 1,
  notes: null,
  ...o,
});

export const planned = (o: Partial<PlannedExercise> & Pick<PlannedExercise, "program_day_id" | "exercise_id">): PlannedExercise => ({
  ...base("pe"),
  position: 0,
  sets: 3,
  rep_min: 6,
  rep_max: 10,
  target_rir: 2,
  load: null,
  rest_seconds: null,
  notes: null,
  is_active: true,
  ...o,
});

export const decision = (
  o: Partial<ProgressionDecision> & Pick<ProgressionDecision, "planned_exercise_id" | "before" | "after">,
): ProgressionDecision => ({
  ...base("dec"),
  workout_id: null,
  decided_at: "2026-10-15T02:30:00.000Z",
  engine_version: "test",
  action: "increase_load",
  reason: "All sets hit the top of the range.",
  inputs: {},
  ...o,
});

export const goal = (o: Partial<Goal> = {}): Goal => ({
  ...base("goal"),
  kind: "hypertrophy",
  description: "Build bigger chest and arms",
  focus_muscles: ["chest", "biceps"],
  target_date: null,
  active: true,
  ...o,
});

export const equipmentProfile = (o: Partial<EquipmentProfile> = {}): EquipmentProfile => ({
  ...base("eq"),
  name: "Home",
  equipment: ["bodyweight", "dumbbells", "bench"],
  dumbbell_increment: 5,
  dumbbell_max: 50,
  barbell_increment: null,
  is_default: true,
  ...o,
});

export const profile = (o: Partial<Profile> = {}): Profile => ({
  user_id: USER,
  display_name: "Levi",
  unit: "lb",
  bodyweight: null,
  timezone: "America/Denver",
  onboarded_at: STAMP,
  created_at: STAMP,
  updated_at: STAMP,
  ...o,
});
