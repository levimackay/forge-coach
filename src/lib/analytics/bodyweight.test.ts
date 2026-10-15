import { describe, expect, it } from "vitest";
import { bodyweightTrend, resolveBodyweight } from "./bodyweight";
import { measurement } from "./testkit";

const m = (measured_on: string, bodyweight: number | null, over = {}) => measurement({ measured_on, bodyweight, ...over });

describe("bodyweightTrend", () => {
  it("evenly rising 180, 181, 182 a week apart is +1 per week", () => {
    const t = bodyweightTrend({ measurements: [m("2026-10-15", 182), m("2026-10-01", 180), m("2026-10-08", 181)] });
    expect(t.points.map((p) => p.date)).toEqual(["2026-10-01", "2026-10-08", "2026-10-15"]);
    expect(t.first).toEqual({ date: "2026-10-01", bodyweight: 180 });
    expect(t.latest).toEqual({ date: "2026-10-15", bodyweight: 182 });
    expect(t.change).toBe(2);
    expect(t.per_week).toBeCloseTo(1, 8);
  });

  it("least squares with uneven readings: 80, 82, 81 over 14 days is +0.5 per week", () => {
    const t = bodyweightTrend({ measurements: [m("2026-10-01", 80), m("2026-10-08", 82), m("2026-10-15", 81)] });
    expect(t.per_week).toBeCloseTo(0.5, 8);
    expect(t.change).toBe(1);
  });

  it("gives no weekly rate for readings less than a week apart", () => {
    const t = bodyweightTrend({ measurements: [m("2026-10-10", 180), m("2026-10-13", 181)] });
    expect(t.change).toBe(1);
    expect(t.per_week).toBeNull();
  });

  it("a single reading has no change or rate", () => {
    const t = bodyweightTrend({ measurements: [m("2026-10-10", 180)] });
    expect(t).toMatchObject({ change: null, per_week: null });
    expect(t.latest).toEqual(t.first);
  });

  it("keeps the most recently edited reading for a day and skips blanks and deleted rows", () => {
    const t = bodyweightTrend({
      measurements: [
        m("2026-10-10", 180, { updated_at: "2026-10-10T08:00:00.000Z" }),
        m("2026-10-10", 181, { updated_at: "2026-10-10T20:00:00.000Z" }),
        m("2026-10-11", null),
        m("2026-10-12", 150, { deleted_at: "2026-10-13T00:00:00Z" }),
      ],
    });
    expect(t.points).toEqual([{ date: "2026-10-10", bodyweight: 181 }]);
  });

  it("filters to a date range", () => {
    const t = bodyweightTrend({
      measurements: [m("2026-09-01", 170), m("2026-10-10", 180)],
      range: { from: "2026-09-18", to: "2026-10-15" },
    });
    expect(t.points).toHaveLength(1);
  });

  it("is empty with no data", () => {
    expect(bodyweightTrend({ measurements: [] })).toEqual({ points: [], first: null, latest: null, change: null, per_week: null });
  });
});

describe("resolveBodyweight", () => {
  const measurements = [m("2026-10-01", 180), m("2026-10-10", 181), m("2026-10-20", 190)];

  it("uses the newest measurement on or before the date", () => {
    expect(resolveBodyweight({ profile: null, measurements, asOf: "2026-10-15" })).toEqual({
      value: 181,
      source: "measurement",
      date: "2026-10-10",
    });
  });

  it("falls back to the profile when there is no earlier measurement", () => {
    expect(resolveBodyweight({ profile: { bodyweight: 175 }, measurements, asOf: "2026-09-01" })).toEqual({
      value: 175,
      source: "profile",
      date: null,
    });
  });

  it("is null when nothing is known", () => {
    expect(resolveBodyweight({ profile: { bodyweight: null }, measurements: [], asOf: "2026-10-15" })).toBeNull();
    expect(resolveBodyweight({ profile: null, measurements: [], asOf: "2026-10-15" })).toBeNull();
  });
});
