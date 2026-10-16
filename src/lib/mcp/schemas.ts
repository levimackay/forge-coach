import { z } from "zod";

// guid, not uuid: accepts any 8-4-4-4-12 hex id, so seeded ids with non-random version bits still pass.
const id = z.guid();

const sets = z.number().int().min(1).max(20);
const reps = z.number().int().min(1).max(100);
const rir = z.number().int().min(0).max(10);
const load = z.number().min(0).max(2000);
const restSeconds = z.number().int().min(0).max(3600);
const note = z.string().max(1000);

export const DayFocusSchema = z.enum(["push", "pull", "legs", "upper", "lower", "full"]);

export const MuscleSchema = z.enum([
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

export const MovementPatternSchema = z.enum([
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

export const EquipmentSchema = z.enum([
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

export const ProposalStatusSchema = z.enum(["pending", "approved", "rejected", "applied", "undone"]);

const hasKeys = (value: object) => Object.values(value).some((v) => v !== undefined);

const repRangeOrdered = (value: { rep_min?: number; rep_max?: number }) =>
  value.rep_min === undefined || value.rep_max === undefined || value.rep_min <= value.rep_max;

const updatePrescription = z.strictObject({
  op: z.literal("update_prescription"),
  planned_exercise_id: id,
  set: z
    .strictObject({
      sets: sets.optional(),
      rep_min: reps.optional(),
      rep_max: reps.optional(),
      target_rir: rir.optional(),
      load: load.nullable().optional(),
      rest_seconds: restSeconds.nullable().optional(),
      notes: note.nullable().optional(),
    })
    .refine(hasKeys, "set must change at least one field")
    .refine(repRangeOrdered, "rep_min must be less than or equal to rep_max")
    .describe("Only the fields to change; at least one. rep_min must not exceed rep_max."),
});

const swapExercise = z.strictObject({
  op: z.literal("swap_exercise"),
  planned_exercise_id: id,
  exercise_id: id,
});

const addExercise = z
  .strictObject({
    op: z.literal("add_exercise"),
    program_day_id: id,
    exercise_id: id,
    position: z.number().int().min(0).max(50),
    sets,
    rep_min: reps,
    rep_max: reps,
    target_rir: rir,
    load: load.nullable(),
  })
  .refine(repRangeOrdered, "rep_min must be less than or equal to rep_max");

const removeExercise = z.strictObject({
  op: z.literal("remove_exercise"),
  planned_exercise_id: id,
});

const updateDay = z.strictObject({
  op: z.literal("update_day"),
  program_day_id: id,
  set: z
    .strictObject({
      name: z.string().trim().min(1).max(80).optional(),
      focus: DayFocusSchema.optional(),
      equipment_profile_id: id.nullable().optional(),
    })
    .refine(hasKeys, "set must change at least one field"),
});

export const ProposalChangeSchema = z.discriminatedUnion("op", [
  updatePrescription.describe("Change the prescription of an existing planned exercise."),
  swapExercise.describe("Replace the exercise in an existing planned slot."),
  addExercise.describe("Add an exercise to a day. position is the slot in that day, numbered as in get_training_plan."),
  removeExercise.describe("Remove a planned exercise from the program. Logged history is kept."),
  updateDay.describe("Rename a day or change its focus or equipment profile."),
]);

// 30 matches the cap the database trigger enforces on coach_proposals.changes.
export const ProposalChangesSchema = z.array(ProposalChangeSchema).min(1).max(30);

export type ProposalChangeInput = z.infer<typeof ProposalChangeSchema>;
