import { describe, expect, it } from "vitest";
import type { Exercise, WorkoutSet } from "@/lib/domain/types";
import {
  DEFAULT_REST_SECONDS,
  WARMUP_REST_SECONDS,
  canLog,
  currentExerciseId,
  describeSet,
  draftToRow,
  firstOpenIndex,
  groupByPlanned,
  initialDraft,
  lastSessionLine,
  minutesBetween,
  nextSetIndex,
  nextToDo,
  restSecondsFor,
  sessionTotals,
  setLine,
  usesLoad,
  workSetsOf,
} from "./workout-model";

const exercise = (over: Partial<Exercise> = {}): Exercise => ({
  id: "bench",
  user_id: null,
  slug: "bench",
  name: "Bench press",
  primary_muscle: "chest",
  secondary_muscles: [],
  movement_pattern: "horizontal_push",
  equipment: ["barbell"],
  load_type: "external",
  progression_group: null,
  ladder_level: null,
  default_rep_min: 6,
  default_rep_max: 10,
  default_increment: 5,
  notes: null,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
  deleted_at: null,
  ...over,
});

let counter = 0;
const set = (over: Partial<WorkoutSet> = {}): WorkoutSet => {
  counter += 1;
  return {
    id: `s${counter}`,
    user_id: "u",
    created_at: "2026-10-15T17:00:00Z",
    updated_at: "2026-10-15T17:00:00Z",
    deleted_at: null,
    workout_id: "w1",
    planned_exercise_id: "p1",
    exercise_id: "bench",
    set_index: 0,
    reps: 8,
    load: 135,
    rir: 2,
    is_warmup: false,
    pain: false,
    completed_at: `2026-10-15T17:${String(10 + counter).padStart(2, "0")}:00Z`,
    notes: null,
    ...over,
  };
};

const prescription = { rep_min: 6, target_rir: 2, load: 135 };

describe("nextSetIndex", () => {
  it("starts at zero and follows the highest live index", () => {
    expect(nextSetIndex([])).toBe(0);
    expect(nextSetIndex([set({ set_index: 0 }), set({ set_index: 1 })])).toBe(2);
  });

  it("ignores deleted sets and survives gaps", () => {
    expect(nextSetIndex([set({ set_index: 0 }), set({ set_index: 4, deleted_at: "2026-10-15T18:00:00Z" })])).toBe(1);
    expect(nextSetIndex([set({ set_index: 0 }), set({ set_index: 3 })])).toBe(4);
  });
});

describe("initialDraft", () => {
  const base = { prescription, targetReps: null, exercise: exercise(), planExerciseId: "bench", logged: [], last: null };

  it("starts from the prescription at the bottom of the rep range", () => {
    expect(initialDraft(base)).toEqual({ reps: 6, load: 135, rir: 2, warmup: false, pain: false, note: "" });
  });

  it("uses the engine's per-set rep goal when there is one", () => {
    expect(initialDraft({ ...base, targetReps: 9 }).reps).toBe(9);
  });

  it("repeats the weight and reps of the previous work set from this session", () => {
    const logged = [set({ set_index: 0, reps: 9, load: 140, rir: 1 }), set({ set_index: 1, reps: 8, load: 140, rir: 0 })];
    expect(initialDraft({ ...base, logged })).toMatchObject({ reps: 8, load: 140 });
  });

  it("starts every set at the plan's target effort, whatever the previous set was", () => {
    const logged = [set({ set_index: 0, reps: 8, load: 140, rir: 0 })];
    expect(initialDraft({ ...base, logged }).rir).toBe(2);
    expect(initialDraft({ ...base, logged: [set({ rir: null })] }).rir).toBe(2);
  });

  it("does not copy a warmup into the first work set", () => {
    const logged = [set({ set_index: 0, reps: 10, load: 65, rir: null, is_warmup: true })];
    expect(initialDraft({ ...base, logged })).toMatchObject({ reps: 6, load: 135 });
  });

  it("leaves the weight empty for external work with no weight yet", () => {
    expect(initialDraft({ ...base, prescription: { ...prescription, load: null } }).load).toBeNull();
  });

  it("never prefills a weight for bodyweight work", () => {
    const pullUp = exercise({ id: "pull-up", load_type: "bodyweight" });
    const d = initialDraft({ ...base, exercise: pullUp, planExerciseId: "pull-up", prescription: { ...prescription, load: 25 } });
    expect(d.load).toBeNull();
  });

  it("keeps the assistance for assisted work", () => {
    const assisted = exercise({ id: "assisted", load_type: "assisted" });
    expect(initialDraft({ ...base, exercise: assisted, planExerciseId: "assisted", prescription: { ...prescription, load: 30 } }).load).toBe(30);
  });

  it("uses last time's first set after a swap, not the old exercise's weight", () => {
    const dumbbell = exercise({ id: "db-press", default_rep_min: 8 });
    const d = initialDraft({ ...base, exercise: dumbbell, last: { sets: [{ reps: 11, load: 45 }, { reps: 10, load: 45 }] } });
    expect(d).toMatchObject({ reps: 11, load: 45, rir: 2 });
  });

  it("starts a swapped exercise with no history at its own default reps and no weight", () => {
    const dumbbell = exercise({ id: "db-press", default_rep_min: 8 });
    expect(initialDraft({ ...base, exercise: dumbbell })).toMatchObject({ reps: 8, load: null });
  });
});

describe("canLog", () => {
  const draft = { reps: 8, load: 100, rir: 2, warmup: false, pain: false, note: "" };

  it("needs reps", () => {
    expect(canLog({ ...draft, reps: null }, exercise())).toBe(false);
    expect(canLog({ ...draft, reps: 0 }, exercise())).toBe(false);
    expect(canLog(draft, exercise())).toBe(true);
  });

  it("needs a weight for external work only", () => {
    expect(canLog({ ...draft, load: null }, exercise())).toBe(false);
    expect(canLog({ ...draft, load: 0 }, exercise())).toBe(true);
    expect(canLog({ ...draft, load: null }, exercise({ load_type: "bodyweight" }))).toBe(true);
    expect(canLog({ ...draft, load: null }, exercise({ load_type: "assisted" }))).toBe(true);
  });
});

describe("draftToRow", () => {
  const args = {
    exercise: exercise(),
    workoutId: "w1",
    plannedExerciseId: "p1",
    setIndex: 3,
    completedAt: "2026-10-15T17:30:00Z",
  };
  const draft = { reps: 8, load: 135, rir: 2, warmup: false, pain: false, note: "  felt strong  " };

  it("builds a set row with a trimmed note", () => {
    expect(draftToRow({ ...args, draft })).toEqual({
      workout_id: "w1",
      planned_exercise_id: "p1",
      exercise_id: "bench",
      set_index: 3,
      reps: 8,
      load: 135,
      rir: 2,
      is_warmup: false,
      pain: false,
      completed_at: "2026-10-15T17:30:00Z",
      notes: "felt strong",
    });
  });

  it("stores a blank note as null", () => {
    expect(draftToRow({ ...args, draft: { ...draft, note: "   " } }).notes).toBeNull();
  });

  it("drops RIR on warmups and load on bodyweight work", () => {
    expect(draftToRow({ ...args, draft: { ...draft, warmup: true } })).toMatchObject({ rir: null, is_warmup: true });
    expect(draftToRow({ ...args, exercise: exercise({ load_type: "bodyweight" }), draft }).load).toBeNull();
  });

  it("keeps the pain flag", () => {
    expect(draftToRow({ ...args, draft: { ...draft, pain: true } }).pain).toBe(true);
  });
});

describe("text helpers", () => {
  it("describes a set", () => {
    expect(describeSet({ reps: 12, load: 50 }, "lb")).toBe("12 reps at 50 lb");
    expect(describeSet({ reps: 1, load: null }, "lb")).toBe("1 rep");
  });

  it("shows a logged set with a multiplication sign, and drops what is missing", () => {
    expect(setLine({ reps: 6, load: 160 }, "lb")).toBe("160 lb × 6");
    expect(setLine({ reps: 8, load: 62.5 }, "kg")).toBe("62.5 kg × 8");
    expect(setLine({ reps: 12, load: null }, "lb")).toBe("12 reps");
    expect(setLine({ reps: 1, load: null }, "lb")).toBe("1 rep");
  });

  it("summarises last time with a shared or changing weight", () => {
    expect(lastSessionLine([{ reps: 6, load: 160 }, { reps: 6, load: 160 }, { reps: 6, load: 160 }], "lb")).toBe("160 lb × 6, 6, 6");
    expect(lastSessionLine([{ reps: 12, load: 50 }, { reps: 10, load: 55 }], "lb")).toBe("50 lb × 12, 55 lb × 10");
    expect(lastSessionLine([{ reps: 8, load: null }, { reps: 7, load: null }], "kg")).toBe("8, 7 reps");
    expect(lastSessionLine([], "lb")).toBe("");
  });

  it("measures minutes", () => {
    expect(minutesBetween("2026-10-15T17:00:00Z", Date.parse("2026-10-15T17:47:30Z"))).toBe(48);
    expect(minutesBetween("2026-10-15T17:00:00Z", Date.parse("2026-10-15T16:00:00Z"))).toBe(0);
  });
});

describe("rest", () => {
  it("uses the plan's rest, a default when missing, and a short rest after warmups", () => {
    expect(restSecondsFor({ rest_seconds: 120 }, false)).toBe(120);
    expect(restSecondsFor({ rest_seconds: null }, false)).toBe(DEFAULT_REST_SECONDS);
    expect(restSecondsFor({ rest_seconds: 120 }, true)).toBe(WARMUP_REST_SECONDS);
  });
});

describe("grouping and progress", () => {
  it("groups by planned exercise, in the order done, without deleted sets", () => {
    const a1 = set({ planned_exercise_id: "a", set_index: 1 });
    const a0 = set({ planned_exercise_id: "a", set_index: 0 });
    const b0 = set({ planned_exercise_id: "b", set_index: 0 });
    const gone = set({ planned_exercise_id: "a", set_index: 2, deleted_at: "2026-10-15T20:00:00Z" });
    const groups = groupByPlanned([a1, b0, gone, a0]);
    expect(groups.get("a")).toEqual([a0, a1]);
    expect(groups.get("b")).toEqual([b0]);
  });

  it("counts work sets and exercises", () => {
    const sets = [
      set({ planned_exercise_id: "a", is_warmup: true }),
      set({ planned_exercise_id: "a" }),
      set({ planned_exercise_id: "a" }),
      set({ planned_exercise_id: "b" }),
    ];
    expect(workSetsOf(sets)).toHaveLength(3);
    expect(sessionTotals(sets)).toEqual({ exercises: 2, workSets: 3 });
  });

  it("finds the first exercise with sets left", () => {
    expect(firstOpenIndex([{ workSets: 3, target: 3 }, { workSets: 1, target: 3 }, { workSets: 0, target: 3 }])).toBe(1);
    expect(firstOpenIndex([{ workSets: 3, target: 3 }])).toBe(-1);
    expect(firstOpenIndex([{ workSets: 4, target: 3 }])).toBe(-1);
  });
});

describe("nextToDo", () => {
  const slots = [
    { id: "a", workSets: 3, target: 3 },
    { id: "b", workSets: 1, target: 3 },
    { id: "c", workSets: 0, target: 2 },
  ];

  it("stays on the exercise while it has sets left, counting the set just saved", () => {
    expect(nextToDo(slots, "b", true)).toBe("b");
    expect(nextToDo(slots, "c", true)).toBe("c");
  });

  it("moves on to the next exercise with sets left once the last set of one is saved", () => {
    expect(nextToDo([{ id: "a", workSets: 2, target: 3 }, ...slots.slice(1)], "a", true)).toBe("b");
    expect(nextToDo([slots[0], { id: "b", workSets: 2, target: 3 }, slots[2]], "b", true)).toBe("c");
  });

  it("does not count a warmup as a set", () => {
    expect(nextToDo([{ id: "a", workSets: 2, target: 3 }, slots[2]], "a", false)).toBe("a");
  });

  it("goes back to an exercise that was skipped, and says null when everything is done", () => {
    expect(nextToDo([{ id: "a", workSets: 0, target: 3 }, { id: "b", workSets: 2, target: 3 }], "b", true)).toBe("a");
    expect(nextToDo([{ id: "a", workSets: 3, target: 3 }, { id: "b", workSets: 2, target: 3 }], "b", true)).toBeNull();
  });

  it("starts from the top when the current exercise is not in the list", () => {
    expect(nextToDo(slots, "gone", false)).toBe("b");
  });
});

describe("currentExerciseId", () => {
  it("prefers a chosen swap, then the newest logged set, then the plan", () => {
    const older = set({ exercise_id: "a", completed_at: "2026-10-15T17:00:00Z" });
    const newer = set({ exercise_id: "b", completed_at: "2026-10-15T17:30:00Z" });
    expect(currentExerciseId({ planExerciseId: "plan", swappedTo: "chosen", sets: [older, newer] })).toBe("chosen");
    expect(currentExerciseId({ planExerciseId: "plan", swappedTo: undefined, sets: [older, newer] })).toBe("b");
    expect(currentExerciseId({ planExerciseId: "plan", swappedTo: undefined, sets: [] })).toBe("plan");
  });
});

describe("usesLoad", () => {
  it("is false only for bodyweight", () => {
    expect(usesLoad({ load_type: "bodyweight" })).toBe(false);
    expect(usesLoad({ load_type: "external" })).toBe(true);
    expect(usesLoad({ load_type: "assisted" })).toBe(true);
  });
});
