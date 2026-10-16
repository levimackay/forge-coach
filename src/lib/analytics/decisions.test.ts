import { describe, expect, it } from "vitest";
import { decisionDigest } from "./decisions";
import { decision, exercise, workout } from "./testkit";

const TZ = "America/Denver";
const bench = exercise({ name: "Bench Press" });
const curl = exercise({ name: "Curl", primary_muscle: "biceps" });
const snap = (ex: { id: string }, load: number | null) => ({ exercise_id: ex.id, sets: 3, rep_min: 6, rep_max: 10, target_rir: 2, load });
const wk = workout();

const d1 = decision({ planned_exercise_id: "pe-1", workout_id: wk.id, decided_at: "2026-10-15T02:30:00.000Z", action: "increase_load", before: snap(bench, 105), after: snap(bench, 110), reason: "Top of range." }); // Oct 14 local
const d2 = decision({ planned_exercise_id: "pe-2", workout_id: wk.id, decided_at: "2026-10-12T23:30:00.000Z", action: "hold", before: snap(curl, 30), after: snap(curl, 30), reason: "Missed reps." });
const d3 = decision({ planned_exercise_id: "pe-2", decided_at: "2026-10-13T23:30:00.000Z", action: "hold", before: snap(curl, 30), after: snap(curl, 30) });
const old = decision({ planned_exercise_id: "pe-1", decided_at: "2026-09-01T12:00:00.000Z", action: "deload", before: snap(bench, 100), after: snap(bench, 90) });
const gone = decision({ planned_exercise_id: "pe-1", decided_at: "2026-10-14T12:00:00.000Z", before: snap(bench, 1), after: snap(bench, 2), deleted_at: "2026-10-14T13:00:00Z" });
const unknown = decision({ planned_exercise_id: "pe-9", decided_at: "2026-10-11T12:00:00.000Z", before: snap({ id: "missing" }, 1), after: snap({ id: "missing" }, 2) });
const all = [d2, old, d1, gone, d3, unknown];
const base = { decisions: all, exercises: [bench, curl], timeZone: TZ };

describe("decisionDigest", () => {
  const r = decisionDigest({ ...base, from: "2026-10-09", to: "2026-10-15" });

  it("counts every decision in the window by action", () => {
    expect(r.total).toBe(4);
    expect(r.by_action).toEqual({ increase_load: 2, hold: 2 });
  });

  it("lists newest first with exercise names and the prescription change", () => {
    expect(r.items.map((i) => i.exercise)).toEqual(["Bench Press", "Curl", "Curl", "Unknown exercise"]);
    expect(r.items[0]).toMatchObject({ action: "increase_load", reason: "Top of range.", workout_id: wk.id });
    expect(r.items[0].before.load).toBe(105);
    expect(r.items[0].after.load).toBe(110);
  });

  it("names the old exercise when a decision swaps the variation", () => {
    const swap = decision({ planned_exercise_id: "pe-3", before: snap(curl, 30), after: snap(bench, null), action: "advance_variation" });
    const r = decisionDigest({ decisions: [swap, d1], exercises: [bench, curl], timeZone: TZ });
    expect(r.items.find((i) => i.action === "advance_variation")).toMatchObject({ exercise: "Bench Press", from_exercise: "Curl" });
    expect(r.items.find((i) => i.action === "increase_load")!.from_exercise).toBeNull();
  });

  it("uses local dates for the window edge: the Oct 14 evening decision is inside Oct 9..14", () => {
    expect(decisionDigest({ ...base, from: "2026-10-09", to: "2026-10-14" }).items.map((i) => i.decided_at)).toContain(d1.decided_at);
    expect(decisionDigest({ ...base, from: "2026-10-15", to: "2026-10-15" }).total).toBe(0);
  });

  it("caps the list but not the totals", () => {
    const capped = decisionDigest({ ...base, from: "2026-10-09", to: "2026-10-15", limit: 1 });
    expect(capped.items).toHaveLength(1);
    expect(capped.total).toBe(4);
  });

  it("filters to one workout", () => {
    const one = decisionDigest({ ...base, workoutId: wk.id });
    expect(one.total).toBe(2);
    expect(one.by_action).toEqual({ increase_load: 1, hold: 1 });
  });

  it("with no window returns everything that is not deleted", () => {
    expect(decisionDigest(base).total).toBe(5);
  });
});
