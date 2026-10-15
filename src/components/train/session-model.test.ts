import { describe, expect, it } from "vitest";
import type { WorkoutSet } from "@/lib/domain/types";
import { describeChange, groupSessionSets, nameLookup, nextTimeChanges } from "./session-model";

let n = 0;
const set = (over: Partial<WorkoutSet>): WorkoutSet => {
  n += 1;
  return {
    id: `s${n}`,
    user_id: "u",
    created_at: "",
    updated_at: "",
    deleted_at: null,
    workout_id: "w",
    planned_exercise_id: "p1",
    exercise_id: "bench",
    set_index: 0,
    reps: 8,
    load: 100,
    rir: 2,
    is_warmup: false,
    pain: false,
    completed_at: `2026-10-15T17:${String(10 + n).padStart(2, "0")}:00Z`,
    notes: null,
    ...over,
  };
};

const names = nameLookup([
  { id: "bench", name: "Bench press" },
  { id: "incline", name: "Incline press" },
  { id: "fly", name: "Cable fly" },
]);

describe("groupSessionSets", () => {
  it("groups by exercise in the order started and numbers work sets after warmups", () => {
    const sets = [
      set({ exercise_id: "bench", set_index: 0, is_warmup: true }),
      set({ exercise_id: "bench", set_index: 1 }),
      set({ exercise_id: "bench", set_index: 2 }),
      set({ planned_exercise_id: "p2", exercise_id: "fly", set_index: 0 }),
    ];
    const groups = groupSessionSets(sets, names);
    expect(groups.map((g) => g.name)).toEqual(["Bench press", "Cable fly"]);
    expect(groups[0].sets.map((s) => s.label)).toEqual(["Warmup", "Set 1", "Set 2"]);
    expect(groups[1].sets.map((s) => s.label)).toEqual(["Set 1"]);
  });

  it("shows a swapped planned exercise as two groups", () => {
    const sets = [
      set({ exercise_id: "bench", set_index: 0 }),
      set({ exercise_id: "incline", set_index: 1 }),
      set({ exercise_id: "incline", set_index: 2 }),
    ];
    const groups = groupSessionSets(sets, names);
    expect(groups.map((g) => `${g.name}:${g.sets.length}`)).toEqual(["Bench press:1", "Incline press:2"]);
  });

  it("skips deleted sets and tolerates a missing planned exercise", () => {
    const sets = [set({ planned_exercise_id: null }), set({ deleted_at: "2026-10-16T00:00:00Z" })];
    expect(groupSessionSets(sets, names)).toHaveLength(1);
    expect(groupSessionSets([], names)).toEqual([]);
  });

  it("names an unknown exercise generically", () => {
    expect(groupSessionSets([set({ exercise_id: "gone" })], names)[0].name).toBe("Exercise");
  });
});

describe("nextTimeChanges", () => {
  const before = { exercise_id: "bench", sets: 3, rep_min: 6, rep_max: 10, target_rir: 2, load: 135 };
  const after = { ...before, exercise_id: "incline", rep_min: 8, rep_max: 12, load: null };

  it("lists nothing for an equipment substitute, which never changes the plan", () => {
    expect(nextTimeChanges({ action: "substitute_equipment", before, after }, "lb", names)).toEqual([]);
  });

  it("lists what a real plan change moves", () => {
    expect(nextTimeChanges({ action: "advance_variation", before, after }, "lb", names)[0]).toBe("Exercise: Incline press (was Bench press)");
  });
});

describe("describeChange", () => {
  const base = { exercise_id: "bench", sets: 3, rep_min: 6, rep_max: 10, target_rir: 2, load: 135 };

  it("is empty when nothing changed", () => {
    expect(describeChange(base, { ...base }, "lb", names)).toEqual([]);
  });

  it("lists each field that moved with the old value", () => {
    const after = { ...base, load: 140, sets: 4, rep_min: 8, rep_max: 12, target_rir: 1 };
    expect(describeChange(base, after, "lb", names)).toEqual([
      "Weight: 140 lb (was 135 lb)",
      "Sets: 4 (was 3)",
      "Rep range: 8 to 12 (was 6 to 10)",
      "Target RIR: 1 (was 2)",
    ]);
  });

  it("names a variation change and a cleared weight", () => {
    const after = { ...base, exercise_id: "incline", load: null };
    expect(describeChange(base, after, "kg", names)).toEqual([
      "Exercise: Incline press (was Bench press)",
      "Weight: choose a new one (was 135 kg)",
    ]);
  });

  it("handles a first weight", () => {
    expect(describeChange({ ...base, load: null }, { ...base, load: 20 }, "lb", names)).toEqual(["Weight: 20 lb (was no weight set)"]);
  });
});
