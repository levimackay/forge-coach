import { describe, expect, it } from "vitest";
import { compareSessions, delta } from "./compare";
import { exerciseSeries } from "./performance";
import { exercise, program, programDay, set, workout } from "./testkit";

const TZ = "America/Denver";
const bench = exercise({ name: "Bench Press" });
const ohp = exercise({ name: "Overhead Press", primary_muscle: "front_delts" });
const fly = exercise({ name: "Cable Fly" });
const row = exercise({ name: "Row", primary_muscle: "lats" });
const library = [bench, ohp, fly, row];

const prog = program();
const push = programDay({ program_id: prog.id, name: "Push A", focus: "push" });
const pull = programDay({ program_id: prog.id, name: "Pull A", focus: "pull" });
const days = [push, pull];

const p1 = workout({ program_day_id: push.id, started_at: "2026-10-01T23:00:00.000Z" });
const p2 = workout({ program_day_id: push.id, started_at: "2026-10-05T23:00:00.000Z" });
const p3 = workout({ program_day_id: push.id, started_at: "2026-10-08T23:00:00.000Z", session_rpe: 8 });
const p4 = workout({
  program_day_id: push.id,
  started_at: "2026-10-12T23:00:00.000Z",
  completed_at: "2026-10-12T23:55:00.000Z",
});
const pl = workout({ program_day_id: pull.id, started_at: "2026-10-10T23:00:00.000Z" });
const pAbandoned = workout({ program_day_id: push.id, started_at: "2026-10-14T23:00:00.000Z", status: "abandoned" });
const adHoc = workout({ started_at: "2026-10-13T23:00:00.000Z" });
const workouts = [p4, p1, pl, p3, p2, pAbandoned, adHoc];

const sets = [
  set({ workout_id: p1.id, exercise_id: bench.id, set_index: 0, load: 100, reps: 8 }),
  set({ workout_id: p1.id, exercise_id: fly.id, set_index: 1, load: 30, reps: 12 }),
  set({ workout_id: p2.id, exercise_id: bench.id, set_index: 0, load: 100, reps: 10 }),
  set({ workout_id: p3.id, exercise_id: bench.id, set_index: 0, load: 105, reps: 8 }),
  set({ workout_id: p3.id, exercise_id: ohp.id, set_index: 1, load: 55, reps: 8 }),
  set({ workout_id: p4.id, exercise_id: bench.id, set_index: 0, load: 105, reps: 10 }),
  set({ workout_id: p4.id, exercise_id: ohp.id, set_index: 1, load: 60, reps: 8 }),
  set({ workout_id: pl.id, exercise_id: row.id, load: 90, reps: 10 }),
  set({ workout_id: pAbandoned.id, exercise_id: bench.id, load: 300, reps: 10 }),
  set({ workout_id: adHoc.id, exercise_id: bench.id, load: 300, reps: 10 }),
];

const base = { workouts, sets, program_days: days, exercises: library, bodyweight: null, timeZone: TZ };

describe("compareSessions by focus", () => {
  const r = compareSessions({ ...base, select: { focus: "push" }, limit: 3 });

  it("takes the last 3 completed push sessions, oldest first", () => {
    expect(r.sessions.map((s) => s.workout_id)).toEqual([p2.id, p3.id, p4.id]);
    expect(r.sessions.map((s) => s.date)).toEqual(["2026-10-05", "2026-10-08", "2026-10-12"]);
    expect(r.sessions.map((s) => s.work_sets)).toEqual([1, 2, 2]);
    expect(r.sessions[0]).toMatchObject({ day_name: "Push A", focus: "push", session_rpe: null, duration_minutes: null });
    expect(r.sessions[1].session_rpe).toBe(8);
    expect(r.sessions[2].duration_minutes).toBe(55);
  });

  it("lists exercises in the newest session's order and leaves out ones only older sessions had", () => {
    expect(r.exercises.map((e) => e.name)).toEqual(["Bench Press", "Overhead Press"]);
  });

  it("bench: 133.33 -> 133 -> 140 e1RM; last vs previous is +7 (5.26%)", () => {
    const bench = r.exercises[0];
    expect(bench.points).toHaveLength(3);
    const d = bench.latest_vs_previous!;
    expect(d.e1rm).toBeCloseTo(7, 6); // 105x10 = 140 vs 105x8 = 133
    expect(d.e1rm_pct).toBeCloseTo(5.2632, 3);
    expect(d.volume_load).toBe(210); // 1050 - 840
    expect(d.total_reps).toBe(2);
    expect(d.max_reps).toBe(2);
    expect(d.work_sets).toBe(0);
  });

  it("bench: last vs first is +6.67 e1RM (5%) and +50 volume", () => {
    const d = r.exercises[0].latest_vs_first!;
    expect(d.e1rm).toBeCloseTo(6.6667, 4); // 140 - 133.3333
    expect(d.e1rm_pct).toBeCloseTo(5, 4);
    expect(d.volume_load).toBe(50); // 1050 - 1000
    expect(d.total_reps).toBe(0);
    expect(d.from_workout_id).toBe(p2.id);
    expect(d.to_workout_id).toBe(p4.id);
  });

  it("overhead press has two points: 55x8 = 69.67 -> 60x8 = 76", () => {
    const d = r.exercises[1].latest_vs_previous!;
    expect(d.e1rm).toBeCloseTo(6.3333, 4);
    expect(d.e1rm_pct).toBeCloseTo(9.0909, 3);
  });

  it("ignores abandoned and ad hoc workouts, and other focuses", () => {
    expect(r.sessions.map((s) => s.workout_id)).not.toContain(pAbandoned.id);
    expect(r.sessions.map((s) => s.workout_id)).not.toContain(adHoc.id);
    expect(r.sessions.map((s) => s.workout_id)).not.toContain(pl.id);
  });
});

describe("compareSessions defaults and selectors", () => {
  it("defaults to the last 4 sessions", () => {
    const r = compareSessions({ ...base, select: { focus: "push" } });
    expect(r.sessions).toHaveLength(4);
    expect(r.exercises.map((e) => e.name)).toEqual(["Bench Press", "Overhead Press", "Cable Fly"]);
  });

  it("has deltas null for an exercise seen once", () => {
    const r = compareSessions({ ...base, select: { focus: "push" } });
    const f = r.exercises.find((e) => e.name === "Cable Fly")!;
    expect(f.latest_vs_previous).toBeNull();
    expect(f.latest_vs_first).toBeNull();
  });

  it("compares explicit workout ids", () => {
    const r = compareSessions({ ...base, select: { workoutIds: [p1.id, p4.id] } });
    expect(r.sessions.map((s) => s.workout_id)).toEqual([p1.id, p4.id]);
    expect(r.exercises.find((e) => e.name === "Bench Press")!.latest_vs_previous!.e1rm).toBeCloseTo(140 - 126.6667, 3);
  });

  it("returns nothing for a focus with no sessions", () => {
    expect(compareSessions({ ...base, select: { focus: "legs" } })).toEqual({ sessions: [], exercises: [] });
  });

  it("skips exercises missing from the library", () => {
    const r = compareSessions({ ...base, exercises: [bench], select: { focus: "push" }, limit: 3 });
    expect(r.exercises.map((e) => e.name)).toEqual(["Bench Press"]);
  });
});

describe("delta", () => {
  it("has null e1RM change when either side has no e1RM", () => {
    const [a, b] = exerciseSeries({ exercise: bench, workouts: [p1, p2], sets, bodyweight: null, timeZone: TZ });
    expect(delta({ ...a, top_e1rm: null }, b).e1rm).toBeNull();
    expect(delta({ ...a, top_e1rm: null }, b).e1rm_pct).toBeNull();
    expect(delta(a, { ...b, volume_load: null }).volume_load).toBeNull();
  });
});
