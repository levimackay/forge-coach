import { describe, expect, it } from "vitest";
import { exerciseSeries, weeklyHardSets, type DecisionItem } from "@/lib/analytics";
import { exercise, set, workout } from "@/lib/analytics/testkit";
import type { DiffContext } from "@/components/coach/diff";
import {
  availableMetrics,
  bestSetText,
  consistencyColumns,
  decisionChangeRows,
  exerciseOptions,
  seriesToLine,
  sessionFacts,
  trendSummary,
  volumeRows,
  weekWindows,
} from "./derive";

const TZ = "UTC";

describe("weekWindows", () => {
  it("returns Monday to Sunday weeks, oldest first, ending with the week of today", () => {
    // 2026-10-15 is a Thursday.
    const weeks = weekWindows("2026-10-15", 3);
    expect(weeks).toEqual([
      { from: "2026-09-28", to: "2026-10-04" },
      { from: "2026-10-05", to: "2026-10-11" },
      { from: "2026-10-12", to: "2026-10-18" },
    ]);
  });

  it("keeps a Sunday in the week that started the Monday before", () => {
    expect(weekWindows("2026-10-18", 1)).toEqual([{ from: "2026-10-12", to: "2026-10-18" }]);
  });
});

describe("consistencyColumns", () => {
  const day = (date: string, over = {}) => workout({ started_at: `${date}T12:00:00.000Z`, completed_at: `${date}T13:00:00.000Z`, ...over });

  it("counts completed sessions per week and separates the unfinished week", () => {
    const workouts = [
      day("2026-10-05"),
      day("2026-10-07"),
      day("2026-10-09"),
      day("2026-10-12"),
      day("2026-10-13", { status: "abandoned" }),
    ];
    const r = consistencyColumns({ workouts, daysPerWeek: 3, today: "2026-10-15", timeZone: TZ, weeks: 3 });
    expect(r.columns.map((c) => c.completed)).toEqual([0, 3, 1]);
    expect(r.columns.map((c) => c.inProgress)).toEqual([false, false, true]);
    expect(r.finishedWeeks).toBe(2);
    expect(r.finishedCompleted).toBe(3);
    expect(r.finishedPlanned).toBe(6);
    expect(r.columns[2].planned).toBe(3);
  });

  it("has no planned figures without a program", () => {
    const r = consistencyColumns({ workouts: [day("2026-10-12")], daysPerWeek: null, today: "2026-10-15", timeZone: TZ, weeks: 2 });
    expect(r.finishedPlanned).toBeNull();
    expect(r.columns.every((c) => c.planned === null)).toBe(true);
  });
});

describe("exerciseOptions", () => {
  const bench = exercise({ name: "Bench Press" });
  const row = exercise({ name: "Barbell Row" });

  it("lists each exercise once, newest first, skipping unknown ids", () => {
    const keys: [string, string][] = [
      [bench.id, "2026-10-01T10:00:00.000Z"],
      [row.id, "2026-10-08T10:00:00.000Z"],
      [bench.id, "2026-10-12T10:00:00.000Z"],
      ["gone", "2026-10-13T10:00:00.000Z"],
    ];
    expect(exerciseOptions(keys, [bench, row]).map((o) => o.name)).toEqual(["Bench Press", "Barbell Row"]);
  });

  it("is empty without sets", () => {
    expect(exerciseOptions([], [bench])).toEqual([]);
  });
});

describe("metrics and series", () => {
  const bench = exercise({ name: "Bench Press", load_type: "external" });
  const pushup = exercise({ name: "Push-up", load_type: "bodyweight" });

  const sessions = (ex: typeof bench, rows: { date: string; reps: number; load: number | null }[]) => {
    const workouts = rows.map((r) => workout({ started_at: `${r.date}T12:00:00.000Z`, completed_at: `${r.date}T13:00:00.000Z` }));
    const sets = rows.map((r, i) =>
      set({ workout_id: workouts[i].id, exercise_id: ex.id, reps: r.reps, load: r.load, rir: 2, completed_at: `${r.date}T12:30:00.000Z` }),
    );
    return exerciseSeries({ exercise: ex, workouts, sets, bodyweight: 180, timeZone: TZ });
  };

  it("offers e1RM, top load, reps and volume for a barbell lift", () => {
    const series = sessions(bench, [
      { date: "2026-10-01", reps: 8, load: 135 },
      { date: "2026-10-08", reps: 8, load: 145 },
    ]);
    expect(availableMetrics(bench, series).map((m) => m.value)).toEqual(["e1rm", "load", "reps", "volume"]);
  });

  it("charts reps first when most sessions go past the e1RM rep cap", () => {
    const series = sessions(bench, [
      { date: "2026-10-01", reps: 12, load: 20 },
      { date: "2026-10-08", reps: 15, load: 20 },
      { date: "2026-10-15", reps: 18, load: 20 },
    ]);
    expect(availableMetrics(bench, series).map((m) => m.value)).toEqual(["reps", "e1rm", "load", "volume"]);
  });

  it("hides the estimated max for plain bodyweight work and shows it once weight is added", () => {
    const plain = sessions(pushup, [
      { date: "2026-10-01", reps: 15, load: null },
      { date: "2026-10-08", reps: 18, load: null },
    ]);
    expect(availableMetrics(pushup, plain).map((m) => m.value)).toEqual(["reps", "volume"]);
    const weighted = sessions(pushup, [
      { date: "2026-10-01", reps: 8, load: 10 },
      { date: "2026-10-08", reps: 8, load: 15 },
    ]);
    expect(availableMetrics(pushup, weighted).map((m) => m.value)).toEqual(["e1rm", "load", "reps", "volume"]);
    expect(availableMetrics(pushup, weighted)[1].name).toBe("added load");
    expect(availableMetrics(pushup, weighted)[0].label).toBe("e1RM");
  });

  it("builds chart points in order and drops sessions without a value", () => {
    const series = sessions(bench, [
      { date: "2026-10-01", reps: 8, load: 135 },
      { date: "2026-10-08", reps: 5, load: null },
      { date: "2026-10-15", reps: 8, load: 150 },
    ]);
    const { points, source } = seriesToLine(series, "load");
    expect(points.map((p) => p.y)).toEqual([135, 150]);
    expect(points.map((p) => p.label)).toEqual(["Oct 1", "Oct 15"]);
    expect(source).toHaveLength(2);
    expect(points[0].x).toBeLessThan(points[1].x);
    expect(seriesToLine(series, "reps").points.map((p) => p.y)).toEqual([8, 5, 8]);
  });

  it("describes the best set and the session", () => {
    const [point] = sessions(bench, [{ date: "2026-10-01", reps: 8, load: 135 }]);
    expect(bestSetText(point, "external", "lb")).toBe("135 lb x 8");
    expect(sessionFacts(point, "external", "lb")).toEqual([
      "Best set: 135 lb x 8",
      "1 work set, 8 reps in total",
      "Average 2 reps in reserve",
    ]);
    const [bw] = sessions(pushup, [{ date: "2026-10-01", reps: 12, load: null }]);
    expect(bestSetText(bw, "bodyweight", "lb")).toBe("12 reps");
    expect(bestSetText({ ...bw, best_set: { reps: 6, load: 25, e1rm: null } }, "bodyweight", "kg")).toBe("+25 kg x 6");
    expect(bestSetText({ ...bw, best_set: { reps: 6, load: 20, e1rm: null } }, "assisted", "lb")).toBe("6 reps with 20 lb assistance");
  });

  it("flags pain in the session facts", () => {
    const w = workout({ started_at: "2026-10-01T12:00:00.000Z", completed_at: "2026-10-01T13:00:00.000Z" });
    const series = exerciseSeries({
      exercise: bench,
      workouts: [w],
      sets: [set({ workout_id: w.id, exercise_id: bench.id, reps: 5, load: 100, pain: true })],
      bodyweight: null,
      timeZone: TZ,
    });
    expect(sessionFacts(series[0], "external", "lb")).toContain("Pain was flagged in this session");
  });
});

describe("trendSummary", () => {
  const pts = (...ys: number[]) => ys.map((y, i) => ({ x: i, y, label: `D${i}` }));

  it("reports direction and size, and nothing for fewer than two points", () => {
    expect(trendSummary(pts(135, 150), "lb")).toBe("Up 15 lb since D0 (2 sessions)");
    expect(trendSummary(pts(150, 140, 142.5), "lb")).toBe("Down 7.5 lb since D0 (3 sessions)");
    expect(trendSummary(pts(100, 100), "lb")).toBe("No change since D0 (2 sessions)");
    expect(trendSummary(pts(100), "lb")).toBeNull();
    expect(trendSummary([], "lb")).toBeNull();
  });
});

describe("volumeRows", () => {
  it("sorts trained muscles by sets and lists the rest as untrained", () => {
    const bench = exercise({ primary_muscle: "chest", secondary_muscles: ["triceps", "front_delts"] });
    const w = workout({ started_at: "2026-10-13T12:00:00.000Z", completed_at: "2026-10-13T13:00:00.000Z" });
    const sets = [1, 2, 3, 4].map((i) => set({ workout_id: w.id, exercise_id: bench.id, rir: 2, set_index: i }));
    const volumes = weeklyHardSets({ workouts: [w], sets, exercises: [bench], weekStart: "2026-10-12", timeZone: TZ });
    const r = volumeRows(volumes);
    expect(r.rows.map((x) => [x.label, x.value])).toEqual([
      ["Chest", 4],
      ["Front delts", 2],
      ["Triceps", 2],
    ]);
    expect(r.untrained).toHaveLength(12);
    expect(r.untrained).toContain("Quads");
    expect(r.total).toBe(4);
    expect(r.rows[0].detail).toBe("4 direct sets, 0 indirect");
  });
});

describe("decisionChangeRows", () => {
  const bench = exercise({ name: "Bench Press" });
  const incline = exercise({ name: "Incline Press" });
  const ctx: DiffContext = {
    planned: new Map(),
    days: new Map(),
    exercises: new Map([bench, incline].map((e) => [e.id, e])),
    equipment: new Map(),
    unit: "lb",
  };
  const item = (over: Partial<DecisionItem>): DecisionItem => ({
    decided_at: "2026-10-12T12:00:00.000Z",
    workout_id: null,
    exercise_id: bench.id,
    exercise: "Bench Press",
    from_exercise: null,
    action: "increase_load",
    before: { exercise_id: bench.id, sets: 3, rep_min: 6, rep_max: 10, target_rir: 2, load: 135 },
    after: { exercise_id: bench.id, sets: 3, rep_min: 6, rep_max: 10, target_rir: 2, load: 140 },
    reason: "x",
    ...over,
  });

  it("lists only what changed", () => {
    expect(decisionChangeRows(item({}), ctx)).toEqual([{ label: "Load", before: "135 lb", after: "140 lb" }]);
  });

  it("is empty for a hold", () => {
    expect(decisionChangeRows(item({ action: "hold", after: item({}).before }), ctx)).toEqual([]);
  });

  it("covers a variation change without comparing loads across exercises", () => {
    const rows = decisionChangeRows(
      item({
        action: "advance_variation",
        from_exercise: "Bench Press",
        exercise: "Incline Press",
        exercise_id: incline.id,
        after: { exercise_id: incline.id, sets: 3, rep_min: 6, rep_max: 10, target_rir: 2, load: null },
      }),
      ctx,
    );
    expect(rows).toEqual([
      { label: "Exercise", before: "Bench Press", after: "Incline Press" },
      { label: "Load", before: null, after: "Not set" },
    ]);
  });
});
