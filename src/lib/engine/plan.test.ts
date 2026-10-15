import { describe, expect, it } from "vitest";
import type { Exercise, ProgramDay } from "@/lib/domain/types";
import { ENGINE_VERSION } from "./config";
import { decideNext } from "./decide";
import type { SetRow, WorkoutRow } from "./history";
import { decisionToWrites, nextSessionPlan } from "./plan";
import { BENCH, DB_CURL, GYM, HOTEL, LIBRARY, NOW, PU_DECLINE, PU_STD, daysAgo, makeInput, makePlanned, makeSets, session } from "./testkit";

const day: ProgramDay = {
  id: "day-1",
  user_id: "u1",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  deleted_at: null,
  program_id: "prog-1",
  position: 1,
  name: "Push",
  focus: "push",
  equipment_profile_id: null,
};

const bench = makePlanned({ id: "pe-1", exercise_id: BENCH.id, position: 1, load: 100, rep_min: 6, rep_max: 10 });
const curl = makePlanned({ id: "pe-2", exercise_id: DB_CURL.id, position: 2, load: 25, rep_min: 8, rep_max: 12 });

const workout = (id: string, days: number, extra: Partial<WorkoutRow> = {}): WorkoutRow => ({
  id,
  status: "completed",
  started_at: daysAgo(days),
  completed_at: daysAgo(days),
  deleted_at: null,
  program_day_id: "day-1",
  ...extra,
});

const rows = (workoutId: string, plannedId: string, exercise: string, reps: number[], load: number): SetRow[] =>
  makeSets(reps, { load, rir: 2, exercise }).map((s) => ({ ...s, workout_id: workoutId, planned_exercise_id: plannedId }));

const history = (days = 3) => ({
  workouts: [workout("w1", days)],
  sets: [...rows("w1", "pe-1", BENCH.id, [10, 10, 10], 100), ...rows("w1", "pe-2", DB_CURL.id, [12, 12, 12], 25)],
});

const plan = (over: { planned?: typeof bench[]; library?: Exercise[]; hist?: ReturnType<typeof history>; equipment?: typeof GYM | null; now?: string; plannedSessions28d?: number } = {}) =>
  nextSessionPlan(day, over.planned ?? [bench, curl], over.library ?? LIBRARY, over.hist ?? history(), [], over.equipment ?? null, over.now ?? NOW, {
    unit: "lb",
    plannedSessions28d: over.plannedSessions28d,
  });

describe("nextSessionPlan", () => {
  it("returns this day's active exercises in plan order", () => {
    const other = makePlanned({ id: "pe-4", exercise_id: BENCH.id, program_day_id: "day-2" });
    const inactive = makePlanned({ id: "pe-3", exercise_id: BENCH.id, is_active: false, position: 0 });
    const deleted = makePlanned({ id: "pe-5", exercise_id: BENCH.id, deleted_at: daysAgo(1), position: 0 });
    const items = plan({ planned: [{ ...curl, position: 1 }, { ...bench, position: 2 }, other, inactive, deleted] });
    expect(items.map((i) => i.planned.id)).toEqual(["pe-2", "pe-1"]);
  });

  it("applies progression from the logged sessions", () => {
    const [first] = plan();
    expect(first.decision.action).toBe("increase_load");
    expect(first.prescription.load).toBe(105);
    expect(first.changed).toBe(true);
    expect(first.rep_ceiling).toBe(10);
    expect(first.exercise.id).toBe(BENCH.id);
  });

  it("reports the stretched rep ceiling for a big dumbbell jump", () => {
    const second = plan()[1];
    expect(second.decision.action).toBe("increase_reps");
    expect(second.changed).toBe(false);
    expect(second.rep_ceiling).toBe(20);
  });

  it("does not progress a session that the plan already reflects", () => {
    const first = plan()[0];
    const { plannedPatch } = decisionToWrites(first.decision, { planned_exercise_id: "pe-1", workout_id: "w1", decided_at: NOW });
    const applied = { ...bench, ...plannedPatch, updated_at: NOW };
    const [again] = plan({ planned: [applied, curl] });
    expect(again.decision.inputs.rule).toBe("plan_already_updated");
    expect(again.prescription.load).toBe(105);
    expect(again.changed).toBe(false);
  });

  it("cuts load after a long break even though the plan is up to date", () => {
    const applied = { ...bench, load: 105, updated_at: NOW };
    const [first] = plan({ planned: [applied], hist: history(20) });
    expect(first.decision.action).toBe("reduce_after_gap");
    expect(first.prescription.load).toBe(90);
    expect(first.changed).toBe(true);
  });

  it("swaps an exercise for the session when the gym lacks the equipment, leaving the plan alone", () => {
    const [first, second] = plan({ equipment: HOTEL });
    expect(first.decision.action).toBe("substitute_equipment");
    expect(first.exercise.id).toBe("ex-db-press");
    expect(first.prescription.exercise_id).toBe("ex-db-press");
    expect(first.planned.exercise_id).toBe(BENCH.id);
    expect(first.changed).toBe(true);
    expect(second.decision.action).not.toBe("substitute_equipment");
  });

  it("leaves out planned exercises that are missing from the library", () => {
    const items = plan({ library: LIBRARY.filter((e) => e.id !== DB_CURL.id) });
    expect(items.map((i) => i.planned.id)).toEqual(["pe-1"]);
  });

  it("feeds the planned-session count into the consistency check", () => {
    const [first] = plan({ plannedSessions28d: 12 });
    expect(first.decision.inputs.rule).toBe("ceiling_low_adherence");
    expect(plan({ plannedSessions28d: 0 })[0].decision.action).toBe("increase_load");
  });

  it("ignores workouts that never finished", () => {
    const hist = history();
    hist.workouts = [workout("w1", 3, { status: "in_progress", completed_at: null })];
    expect(plan({ hist })[0].decision.inputs.rule).toBe("no_history");
  });

  it("returns an empty plan for a day with nothing planned", () => {
    expect(plan({ planned: [] })).toEqual([]);
  });

  it("matches calling the engine directly", () => {
    const [first] = plan();
    const direct = decideNext(
      makeInput({
        exercise: BENCH,
        prescription: { load: 100, rep_min: 6, rep_max: 10, target_rir: 2, sets: 3 },
        history: [session(3, makeSets([10, 10, 10], { load: 100, rir: 2 }), "w1")],
        consistency: { days_since_last_session: 3, sessions_last_28d: 1, planned_last_28d: 0 },
      }),
    );
    expect(first.decision.action).toBe(direct.action);
    expect(first.decision.after).toEqual(direct.after);
  });
});

describe("decisionToWrites", () => {
  const ctx = { planned_exercise_id: "pe-1", workout_id: "w1", decided_at: NOW };
  const decide = (input: Parameters<typeof makeInput>[0]) => decideNext(makeInput(input));

  it("patches only what changed and builds the decision row", () => {
    const d = decide({ history: [session(3, makeSets([10, 10, 10], { load: 100, rir: 2 }))] });
    const { plannedPatch, decisionRow } = decisionToWrites(d, ctx);
    expect(plannedPatch).toEqual({ load: 105 });
    expect(decisionRow).toEqual({
      planned_exercise_id: "pe-1",
      workout_id: "w1",
      decided_at: NOW,
      engine_version: ENGINE_VERSION,
      action: "increase_load",
      before: d.before,
      after: d.after,
      reason: d.reason,
      inputs: d.inputs,
    });
  });

  it("patches the exercise when a variation advances", () => {
    const d = decide({ exercise: PU_STD, history: [session(3, makeSets([20, 20, 20], { load: null, exercise: PU_STD.id }))] });
    expect(decisionToWrites(d, ctx).plannedPatch).toEqual({ exercise_id: PU_DECLINE.id });
  });

  it("clears the load when moving to an unloaded variation", () => {
    const d = decide({ exercise: PU_STD, history: [session(3, makeSets([20, 20, 20], { load: null, exercise: PU_STD.id }))] });
    const loaded = { ...d, before: { ...d.before, load: 50 } };
    expect(decisionToWrites(loaded, ctx).plannedPatch).toEqual({ exercise_id: PU_DECLINE.id, load: null });
  });

  it("writes an empty patch for decisions that change nothing", () => {
    const pain = decide({ history: [session(3, makeSets([10, 10, 10], { load: 100, pain: [true] }))] });
    expect(decisionToWrites(pain, ctx).plannedPatch).toEqual({});
    const none = decide({ history: [] });
    expect(decisionToWrites(none, ctx).plannedPatch).toEqual({});
    expect(decisionToWrites(none, ctx).decisionRow.action).toBe("hold");
  });

  it("never rewrites the plan for an equipment swap but still records it", () => {
    const d = decide({ equipment: HOTEL });
    const w = decisionToWrites(d, ctx);
    expect(w.plannedPatch).toEqual({});
    expect(w.decisionRow.action).toBe("substitute_equipment");
    expect(w.decisionRow.after.exercise_id).toBe("ex-db-press");
  });

  it("writes the reduced load after a gap", () => {
    const d = decide({ history: [session(20, makeSets([10, 10, 10], { load: 100, rir: 2 }))] });
    expect(decisionToWrites(d, ctx).plannedPatch).toEqual({ load: 90 });
  });

  it("produces JSON-safe rows that carry no identity fields", () => {
    const d = decide({ history: [session(3, makeSets([10, 10, 10], { load: 100, rir: 2 }))] });
    const { decisionRow } = decisionToWrites(d, ctx);
    expect(JSON.parse(JSON.stringify(decisionRow))).toEqual(decisionRow);
    expect(Object.keys(decisionRow)).not.toContain("id");
    expect(Object.keys(decisionRow)).not.toContain("user_id");
  });
});
