import { describe, expect, it } from "vitest";
import type { EquipmentProfile, Exercise, InverseChange, PlannedExercise, ProgramDay } from "@/lib/domain/types";
import { describeChanges, type DiffContext } from "./diff";

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TS = "2026-10-01T00:00:00.000Z";

const exercise = (n: number, name: string, load_type: Exercise["load_type"] = "external"): Exercise => ({
  id: ID(n),
  user_id: null,
  slug: name.toLowerCase().replace(/ /g, "-"),
  name,
  primary_muscle: "chest",
  secondary_muscles: [],
  movement_pattern: "horizontal_push",
  equipment: [],
  load_type,
  progression_group: null,
  ladder_level: null,
  default_rep_min: 6,
  default_rep_max: 10,
  default_increment: 5,
  notes: null,
  created_at: TS,
  updated_at: TS,
  deleted_at: null,
});

const bench = exercise(1, "Bench Press");
const incline = exercise(2, "Incline Dumbbell Press");
const pushup = exercise(3, "Push-up", "bodyweight");

const day: ProgramDay = {
  id: ID(10),
  user_id: ID(99),
  created_at: TS,
  updated_at: TS,
  deleted_at: null,
  program_id: ID(20),
  position: 0,
  name: "Push A",
  focus: "push",
  equipment_profile_id: null,
};

const planned = (over: Partial<PlannedExercise> = {}): PlannedExercise => ({
  id: ID(30),
  user_id: ID(99),
  created_at: TS,
  updated_at: TS,
  deleted_at: null,
  program_day_id: day.id,
  position: 0,
  exercise_id: bench.id,
  sets: 3,
  rep_min: 6,
  rep_max: 10,
  target_rir: 2,
  load: 135,
  rest_seconds: 90,
  notes: null,
  is_active: true,
  ...over,
});

const gym: EquipmentProfile = {
  id: ID(40),
  user_id: ID(99),
  created_at: TS,
  updated_at: TS,
  deleted_at: null,
  name: "Garage gym",
  equipment: ["barbell"],
  dumbbell_increment: null,
  dumbbell_max: null,
  barbell_increment: 5,
  is_default: true,
};

const ctx = (p: PlannedExercise = planned()): DiffContext => ({
  planned: new Map([[p.id, p]]),
  days: new Map([[day.id, day]]),
  exercises: new Map([bench, incline, pushup].map((e) => [e.id, e])),
  equipment: new Map([[gym.id, gym]]),
  unit: "lb",
});

describe("update_prescription", () => {
  it("lists only the values that change, with before and after", () => {
    const [block] = describeChanges(
      [{ op: "update_prescription", planned_exercise_id: ID(30), set: { sets: 4, target_rir: 1, load: 140, rest_seconds: 120 } }],
      ctx(),
      "pending",
    );
    expect(block.verb).toBe("Change");
    expect(block.title).toBe("Bench Press");
    expect(block.place).toBe("Push A");
    expect(block.rows).toEqual([
      { label: "Sets", before: "3", after: "4" },
      { label: "Reps in reserve", before: "2", after: "1" },
      { label: "Load", before: "135 lb", after: "140 lb" },
      { label: "Rest", before: "1 min 30 sec", after: "2 min" },
    ]);
    expect(block.warning).toBeNull();
  });

  it("merges a one-sided rep change into the full range", () => {
    const [block] = describeChanges(
      [{ op: "update_prescription", planned_exercise_id: ID(30), set: { rep_max: 12 } }],
      ctx(),
      "pending",
    );
    expect(block.rows).toEqual([{ label: "Reps", before: "6 to 10 reps", after: "6 to 12 reps" }]);
  });

  it("says so when the proposal sets what is already set", () => {
    const [block] = describeChanges(
      [{ op: "update_prescription", planned_exercise_id: ID(30), set: { sets: 3, load: 135 } }],
      ctx(),
      "pending",
    );
    expect(block.rows).toEqual([]);
    expect(block.warning).toBe("Already set to these values.");
  });

  it("flags an exercise that is not in the program", () => {
    const [block] = describeChanges(
      [{ op: "update_prescription", planned_exercise_id: ID(77), set: { sets: 5 } }],
      ctx(),
      "pending",
    );
    expect(block.warning).toMatch(/not in your current program/);
    expect(block.rows).toEqual([{ label: "Sets", before: null, after: "5" }]);
  });

  it("shows a cleared load on a bodyweight exercise as Bodyweight, otherwise Not set", () => {
    const p = planned({ exercise_id: pushup.id, load: 10 });
    const [bw] = describeChanges([{ op: "update_prescription", planned_exercise_id: p.id, set: { load: null } }], ctx(p), "pending");
    expect(bw.rows).toEqual([{ label: "Load", before: "10 lb", after: "Bodyweight" }]);
    const [ext] = describeChanges([{ op: "update_prescription", planned_exercise_id: ID(30), set: { load: null } }], ctx(), "pending");
    expect(ext.rows[0].after).toBe("Not set");
  });

  it("uses kg when the lifter does", () => {
    const [block] = describeChanges(
      [{ op: "update_prescription", planned_exercise_id: ID(30), set: { load: 62.5 } }],
      { ...ctx(), unit: "kg" },
      "pending",
    );
    expect(block.rows[0]).toEqual({ label: "Load", before: "135 kg", after: "62.5 kg" });
  });
});

describe("swap, add, remove, update_day", () => {
  it("swap names both exercises and notes the cleared load", () => {
    const [block] = describeChanges([{ op: "swap_exercise", planned_exercise_id: ID(30), exercise_id: incline.id }], ctx(), "pending");
    expect(block.verb).toBe("Swap");
    expect(block.title).toBe("Bench Press for Incline Dumbbell Press");
    expect(block.rows[0]).toEqual({ label: "Exercise", before: "Bench Press", after: "Incline Dumbbell Press" });
    expect(block.rows[1]).toMatchObject({ label: "Load", before: "135 lb" });
  });

  it("swap skips the load row when no load was planned", () => {
    const p = planned({ load: null });
    const [block] = describeChanges([{ op: "swap_exercise", planned_exercise_id: p.id, exercise_id: incline.id }], ctx(p), "pending");
    expect(block.rows).toHaveLength(1);
  });

  it("add shows the whole prescription and the day", () => {
    const [block] = describeChanges(
      [{ op: "add_exercise", program_day_id: day.id, exercise_id: pushup.id, position: 3, sets: 3, rep_min: 8, rep_max: 12, target_rir: 2, load: null }],
      ctx(),
      "pending",
    );
    expect(block.verb).toBe("Add");
    expect(block.place).toBe("Push A");
    expect(block.rows).toEqual([
      { label: "Sets", before: null, after: "3" },
      { label: "Reps", before: null, after: "8 to 12 reps" },
      { label: "Reps in reserve", before: null, after: "2" },
      { label: "Load", before: null, after: "Bodyweight" },
      { label: "Slot", before: null, after: "4" },
    ]);
  });

  it("remove says history is kept", () => {
    const [block] = describeChanges([{ op: "remove_exercise", planned_exercise_id: ID(30) }], ctx(), "pending");
    expect(block.verb).toBe("Remove");
    expect(block.rows[0].after).toMatch(/history for it stays/);
  });

  it("update_day resolves equipment profile names", () => {
    const [block] = describeChanges(
      [{ op: "update_day", program_day_id: day.id, set: { name: "Push B", focus: "upper", equipment_profile_id: gym.id } }],
      ctx(),
      "pending",
    );
    expect(block.rows).toEqual([
      { label: "Name", before: "Push A", after: "Push B" },
      { label: "Focus", before: "Push", after: "Upper" },
      { label: "Equipment", before: "Any equipment", after: "Garage gym" },
    ]);
  });
});

describe("history modes", () => {
  it("record mode lists proposed values with nothing to compare against", () => {
    const [block] = describeChanges(
      [{ op: "update_prescription", planned_exercise_id: ID(30), set: { sets: 4, load: 140 } }],
      ctx(),
      "record",
    );
    expect(block.rows).toEqual([
      { label: "Sets", before: null, after: "4" },
      { label: "Load", before: null, after: "140 lb" },
    ]);
    expect(block.warning).toBeNull();
  });

  it("applied mode rebuilds the earlier values from the stored inverse", () => {
    const nowPlanned = planned({ sets: 4, load: 140 });
    const inverse: InverseChange[] = [{ op: "update_prescription", planned_exercise_id: ID(30), set: { sets: 3, load: 135 } }];
    const [block] = describeChanges(
      [{ op: "update_prescription", planned_exercise_id: ID(30), set: { sets: 4, load: 140 } }],
      ctx(nowPlanned),
      "applied",
      inverse,
    );
    expect(block.rows).toEqual([
      { label: "Sets", before: "3", after: "4" },
      { label: "Load", before: "135 lb", after: "140 lb" },
    ]);
  });

  it("applied swap shows the exercise and load that were replaced", () => {
    const nowPlanned = planned({ exercise_id: incline.id, load: null });
    const inverse: InverseChange[] = [
      { op: "swap_exercise", planned_exercise_id: ID(30), exercise_id: bench.id },
      { op: "update_prescription", planned_exercise_id: ID(30), set: { load: 135 } },
    ];
    const [block] = describeChanges(
      [{ op: "swap_exercise", planned_exercise_id: ID(30), exercise_id: incline.id }],
      ctx(nowPlanned),
      "applied",
      inverse,
    );
    expect(block.rows[0]).toEqual({ label: "Exercise", before: "Bench Press", after: "Incline Dumbbell Press" });
    expect(block.rows[1]).toMatchObject({ label: "Load", before: "135 lb" });
  });

  it("applied mode without an inverse still lists the proposed values", () => {
    const [block] = describeChanges(
      [{ op: "update_prescription", planned_exercise_id: ID(30), set: { sets: 4 } }],
      ctx(planned({ sets: 4 })),
      "applied",
      null,
    );
    expect(block.rows).toEqual([]);
  });
});
