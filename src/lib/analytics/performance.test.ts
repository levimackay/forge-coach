import { describe, expect, it } from "vitest";
import { exerciseSeries, summarizeSets } from "./performance";
import { exercise, set, workout } from "./testkit";

const bench = exercise({ name: "Bench Press" });
const pushup = exercise({ name: "Push-up", load_type: "bodyweight" });
const assistedPullup = exercise({ name: "Assisted Pull-up", load_type: "assisted", primary_muscle: "lats" });
const TZ = "America/Denver";

describe("summarizeSets", () => {
  const w = workout();
  const s = (o: Partial<Parameters<typeof set>[0]>) => set({ workout_id: w.id, exercise_id: bench.id, ...o });

  it("returns null when there are no work sets", () => {
    expect(summarizeSets(bench, [], null)).toBeNull();
    expect(summarizeSets(bench, [s({ is_warmup: true, load: 60 })], null)).toBeNull();
    expect(summarizeSets(bench, [s({ reps: 0, load: 100 })], null)).toBeNull();
  });

  it("105x8 rir2 and 105x7 rir1, ignoring a warmup", () => {
    const r = summarizeSets(
      bench,
      [
        s({ load: 60, reps: 10, is_warmup: true }),
        s({ load: 105, reps: 8, rir: 2 }),
        s({ load: 105, reps: 7, rir: 1 }),
      ],
      null,
    )!;
    expect(r.work_sets).toBe(2);
    expect(r.total_reps).toBe(15);
    expect(r.max_reps).toBe(8);
    expect(r.top_e1rm).toBeCloseTo(133, 6); // 105 * (1 + 8/30)
    expect(r.best_set).toEqual({ reps: 8, load: 105, e1rm: r.top_e1rm });
    expect(r.volume_load).toBe(1575); // 840 + 735
    expect(r.top_load).toBe(105);
    expect(r.reps_at_top_load).toBe(8);
    expect(r.avg_rir).toBe(1.5);
    expect(r.pain).toBe(false);
  });

  it("picks the heavier set as best when e1RM is higher, and reports reps at that top load", () => {
    const r = summarizeSets(bench, [s({ load: 100, reps: 10 }), s({ load: 120, reps: 4 }), s({ load: 120, reps: 3 })], null)!;
    // 100x10 = 133.33, 120x4 = 136.0
    expect(r.best_set).toMatchObject({ reps: 4, load: 120 });
    expect(r.top_load).toBe(120);
    expect(r.reps_at_top_load).toBe(4);
  });

  it("breaks an e1RM tie past the rep cap toward the set with more reps", () => {
    const r = summarizeSets(bench, [s({ load: 20, reps: 12 }), s({ load: 20, reps: 15 }), s({ load: 20, reps: 15 })], null)!;
    expect(r.best_set).toMatchObject({ reps: 15, load: 20 });
    expect(r.top_e1rm).toBeCloseTo(28, 6);
  });

  it("bodyweight with known bodyweight: 180 x (1 + min(15,12)/30) = 252, volume 180 x 37", () => {
    const r = summarizeSets(pushup, [s({ exercise_id: pushup.id, reps: 15 }), s({ exercise_id: pushup.id, reps: 12 }), s({ exercise_id: pushup.id, reps: 10 })], 180)!;
    expect(r.top_e1rm).toBeCloseTo(252, 6);
    expect(r.volume_load).toBe(6660);
    expect(r.max_reps).toBe(15);
  });

  it("bodyweight without bodyweight falls back to reps: no e1RM, no volume, best set = most reps", () => {
    const r = summarizeSets(pushup, [s({ exercise_id: pushup.id, reps: 12 }), s({ exercise_id: pushup.id, reps: 15 })], null)!;
    expect(r.top_e1rm).toBeNull();
    expect(r.volume_load).toBeNull();
    expect(r.best_set).toEqual({ reps: 15, load: null, e1rm: null });
    expect(r.total_reps).toBe(27);
  });

  it("volume is null when any set has no knowable load", () => {
    const r = summarizeSets(bench, [s({ load: 100, reps: 5 }), s({ load: null, reps: 5 })], null)!;
    expect(r.volume_load).toBeNull();
    expect(r.top_e1rm).toBeCloseTo(116.6667, 4);
  });

  it("assisted: less assistance is the harder set", () => {
    const a = (load: number, reps: number) => s({ exercise_id: assistedPullup.id, load, reps });
    const r = summarizeSets(assistedPullup, [a(40, 10), a(30, 6), a(30, 5)], 180)!;
    expect(r.top_load).toBe(30);
    expect(r.reps_at_top_load).toBe(6);
    // best by e1RM is 40 assist x 10: (180-40) * (1 + 10/30); the hardest set is the 30 assist one
    expect(r.top_e1rm).toBeCloseTo(186.6667, 4);
  });

  it("flags pain from any set including warmups, and ignores soft-deleted sets", () => {
    expect(summarizeSets(bench, [s({ load: 100, reps: 5 }), s({ load: 60, reps: 5, is_warmup: true, pain: true })], null)!.pain).toBe(true);
    expect(summarizeSets(bench, [s({ load: 100, reps: 5 }), s({ load: 100, reps: 5, pain: true, deleted_at: "2026-10-13T00:00:00Z" })], null)!.pain).toBe(false);
  });

  it("avg_rir is null when no rir was logged", () => {
    expect(summarizeSets(bench, [s({ load: 100, reps: 5 })], null)!.avg_rir).toBeNull();
  });
});

describe("exerciseSeries", () => {
  const w1 = workout({ started_at: "2026-10-05T23:00:00.000Z" });
  const w2 = workout({ started_at: "2026-10-12T23:00:00.000Z" });
  const w3 = workout({ started_at: "2026-10-15T02:00:00.000Z" }); // Oct 14 in Denver
  const abandoned = workout({ started_at: "2026-10-13T23:00:00.000Z", status: "abandoned" });
  const inProgress = workout({ started_at: "2026-10-14T23:00:00.000Z", status: "in_progress" });
  const sets = [
    set({ workout_id: w2.id, exercise_id: bench.id, load: 105, reps: 8 }),
    set({ workout_id: w1.id, exercise_id: bench.id, load: 100, reps: 8 }),
    set({ workout_id: w3.id, exercise_id: bench.id, load: 110, reps: 8 }),
    set({ workout_id: w3.id, exercise_id: pushup.id, reps: 10 }),
    set({ workout_id: abandoned.id, exercise_id: bench.id, load: 200, reps: 8 }),
    set({ workout_id: inProgress.id, exercise_id: bench.id, load: 200, reps: 8 }),
  ];
  const workouts = [w3, w1, w2, abandoned, inProgress];

  it("returns one chronological point per completed workout, in the athlete's local date", () => {
    const series = exerciseSeries({ exercise: bench, workouts, sets, bodyweight: null, timeZone: TZ });
    expect(series.map((p) => [p.workout_id, p.date])).toEqual([
      [w1.id, "2026-10-05"],
      [w2.id, "2026-10-12"],
      [w3.id, "2026-10-14"],
    ]);
    expect(series.map((p) => p.top_e1rm)).toEqual([
      expect.closeTo(126.6667, 4),
      expect.closeTo(133, 4),
      expect.closeTo(139.3333, 4),
    ]);
  });

  it("only includes the requested exercise", () => {
    const series = exerciseSeries({ exercise: pushup, workouts, sets, bodyweight: 180, timeZone: TZ });
    expect(series).toHaveLength(1);
    expect(series[0].top_e1rm).toBeCloseTo(240, 6); // 180 * (1 + 10/30)
  });

  it("is empty when the exercise was never done", () => {
    expect(exerciseSeries({ exercise: assistedPullup, workouts, sets, bodyweight: 180, timeZone: TZ })).toEqual([]);
  });
});
