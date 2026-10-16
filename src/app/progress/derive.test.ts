import { describe, expect, it } from "vitest";
import { exerciseSeries } from "@/lib/analytics";
import { exercise, set, workout } from "@/lib/analytics/testkit";
import { exerciseOptions, headlineMeasure, seriesToLine, shown, sinceText } from "./derive";

const TZ = "UTC";

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

describe("headline measure and series", () => {
  const bench = exercise({ name: "Bench Press", load_type: "external" });
  const pushup = exercise({ name: "Push-up", load_type: "bodyweight" });

  const sessions = (ex: typeof bench, rows: { date: string; reps: number; load: number | null }[], bodyweight: number | null = 180) => {
    const workouts = rows.map((r) => workout({ started_at: `${r.date}T12:00:00.000Z`, completed_at: `${r.date}T13:00:00.000Z` }));
    const sets = rows.map((r, i) =>
      set({ workout_id: workouts[i].id, exercise_id: ex.id, reps: r.reps, load: r.load, rir: 2, completed_at: `${r.date}T12:30:00.000Z` }),
    );
    return exerciseSeries({ exercise: ex, workouts, sets, bodyweight, timeZone: TZ });
  };

  it("tells a barbell lift as an estimated max", () => {
    const series = sessions(bench, [
      { date: "2026-10-01", reps: 8, load: 135 },
      { date: "2026-10-08", reps: 8, load: 145 },
    ]);
    expect(headlineMeasure(bench, series)).toBe("e1rm");
  });

  it("tells a lift in reps when most sessions go past the estimate's rep cap", () => {
    const series = sessions(bench, [
      { date: "2026-10-01", reps: 12, load: 20 },
      { date: "2026-10-08", reps: 15, load: 20 },
      { date: "2026-10-15", reps: 18, load: 20 },
    ]);
    expect(headlineMeasure(bench, series)).toBe("reps");
  });

  it("tells plain bodyweight work in reps, and an estimated max once weight is added", () => {
    const plain = sessions(pushup, [
      { date: "2026-10-01", reps: 15, load: null },
      { date: "2026-10-08", reps: 18, load: null },
    ]);
    expect(headlineMeasure(pushup, plain)).toBe("reps");
    const weighted = sessions(pushup, [
      { date: "2026-10-01", reps: 8, load: 10 },
      { date: "2026-10-08", reps: 8, load: 15 },
    ]);
    expect(headlineMeasure(pushup, weighted)).toBe("e1rm");
  });

  it("falls back to reps for a weighted bodyweight lift with no bodyweight on file", () => {
    const series = sessions(
      pushup,
      [
        { date: "2026-10-01", reps: 8, load: 10 },
        { date: "2026-10-08", reps: 8, load: 15 },
      ],
      null,
    );
    expect(series.every((p) => p.top_e1rm === null)).toBe(true);
    expect(headlineMeasure(pushup, series)).toBe("reps");
  });

  it("builds chart points in order and drops sessions without a value", () => {
    const series = sessions(bench, [
      { date: "2026-10-01", reps: 8, load: 135 },
      { date: "2026-10-08", reps: 5, load: null },
      { date: "2026-10-15", reps: 8, load: 150 },
    ]);
    const points = seriesToLine(series, "e1rm");
    expect(points.map((p) => Math.round(p.y))).toEqual([171, 190]);
    expect(points.map((p) => p.label)).toEqual(["Oct 1", "Oct 15"]);
    expect(points[0].x).toBeLessThan(points[1].x);
    expect(seriesToLine(series, "reps").map((p) => p.y)).toEqual([8, 5, 8]);
  });
});

describe("sinceText", () => {
  const pts = (...ys: number[]) => ys.map((y, i) => ({ x: i, y, label: `D${i}` }));

  it("reports direction and size from the first point, in the unit the figure uses", () => {
    expect(sinceText(pts(186, 196, 207, 192), "e1rm", "lb")).toBe("Up 6 lb since D0");
    expect(sinceText(pts(150, 140), "e1rm", "kg")).toBe("Down 10 kg since D0");
    expect(sinceText(pts(100, 100), "e1rm", "lb")).toBe("No change since D0");
  });

  it("works from the rounded values the screen shows", () => {
    expect(sinceText(pts(185.6, 192.3), "e1rm", "lb")).toBe("Up 6 lb since D0");
  });

  it("counts reps with singular and plural", () => {
    expect(sinceText(pts(8, 9), "reps", "lb")).toBe("Up 1 rep since D0");
    expect(sinceText(pts(8, 5), "reps", "lb")).toBe("Down 3 reps since D0");
  });

  it("is null for fewer than two points", () => {
    expect(sinceText(pts(100), "e1rm", "lb")).toBeNull();
    expect(sinceText([], "e1rm", "lb")).toBeNull();
  });
});

describe("shown", () => {
  it("rounds to a whole number with a thousands separator", () => {
    expect(shown(191.6)).toBe("192");
    expect(shown(1005.2)).toBe("1,005");
  });
});
