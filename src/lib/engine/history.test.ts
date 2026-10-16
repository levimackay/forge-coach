import { describe, expect, it } from "vitest";
import { consistencyFromWorkouts, plannedSessionsLast28d, recoveryStatus, sessionsFromRows, type SetRow, type WorkoutRow } from "./history";
import { NOW, daysAgo } from "./testkit";

const workout = (id: string, days: number, extra: Partial<WorkoutRow> = {}): WorkoutRow => ({
  id,
  status: "completed",
  started_at: daysAgo(days),
  completed_at: daysAgo(days),
  deleted_at: null,
  program_day_id: "day-1",
  ...extra,
});

const row = (workoutId: string, index: number, reps: number, extra: Partial<SetRow> = {}): SetRow => ({
  workout_id: workoutId,
  planned_exercise_id: "pe-1",
  exercise_id: "ex-bench",
  set_index: index,
  reps,
  load: 100,
  rir: 2,
  is_warmup: false,
  pain: false,
  ...extra,
});

describe("sessionsFromRows", () => {
  it("groups sets by workout, newest first", () => {
    const workouts = [workout("a", 10), workout("b", 3), workout("c", 7)];
    const sets = [row("a", 1, 8), row("b", 1, 9), row("b", 2, 9), row("c", 1, 10)];
    const out = sessionsFromRows(workouts, sets, "pe-1");
    expect(out.map((s) => s.workout_id)).toEqual(["b", "c", "a"]);
    expect(out[0].sets).toHaveLength(2);
  });

  it("keeps only this planned exercise's sets", () => {
    const out = sessionsFromRows([workout("a", 3)], [row("a", 1, 8), row("a", 2, 8, { planned_exercise_id: "pe-2" })], "pe-1");
    expect(out[0].sets).toHaveLength(1);
  });

  it("skips unfinished, abandoned and deleted workouts and deleted sets", () => {
    const workouts = [
      workout("a", 3),
      workout("b", 4, { status: "in_progress", completed_at: null }),
      workout("c", 5, { status: "abandoned" }),
      workout("d", 6, { deleted_at: daysAgo(1) }),
    ];
    const sets = [row("a", 1, 8), row("a", 2, 8, { deleted_at: daysAgo(1) }), row("b", 1, 8), row("c", 1, 8), row("d", 1, 8)];
    const out = sessionsFromRows(workouts, sets, "pe-1");
    expect(out.map((s) => s.workout_id)).toEqual(["a"]);
    expect(out[0].sets).toHaveLength(1);
  });

  it("applies the limit after sorting", () => {
    const workouts = [workout("a", 9), workout("b", 2), workout("c", 5)];
    const sets = workouts.map((w) => row(w.id, 1, 8));
    expect(sessionsFromRows(workouts, sets, "pe-1", 2).map((s) => s.workout_id)).toEqual(["b", "c"]);
  });

  it("returns nothing when there are no matching sets", () => {
    expect(sessionsFromRows([], [], "pe-1")).toEqual([]);
  });
});

describe("consistencyFromWorkouts", () => {
  it("counts this day's completed sessions and the newest gap", () => {
    const workouts = [workout("a", 3), workout("b", 10), workout("c", 40), workout("d", 2, { program_day_id: "day-2" })];
    expect(consistencyFromWorkouts(workouts, "day-1", NOW, 8)).toEqual({
      days_since_last_session: 3,
      sessions_last_28d: 2,
      planned_last_28d: 8,
    });
  });

  it("reports null when the day was never trained", () => {
    expect(consistencyFromWorkouts([], "day-1", NOW)).toEqual({ days_since_last_session: null, sessions_last_28d: 0, planned_last_28d: 0 });
  });

  it("ignores sessions that were not completed", () => {
    const out = consistencyFromWorkouts([workout("a", 1, { status: "abandoned" })], "day-1", NOW);
    expect(out.days_since_last_session).toBeNull();
  });
});

describe("recoveryStatus", () => {
  const log = (days: number, sleep: number | null, soreness: number | null, extra: object = {}) => ({
    date: daysAgo(days).slice(0, 10),
    sleep_hours: sleep,
    soreness,
    ...extra,
  });

  it("flags a trend of two poor days among the newest three", () => {
    const out = recoveryStatus([log(0, 5, 2), log(1, 8, 4), log(2, 8, 1)], NOW);
    expect(out).toEqual({ poor: true, poor_days: 2, considered: 3 });
  });

  it("does not flag a single bad night", () => {
    expect(recoveryStatus([log(0, 5, 2), log(1, 8, 2), log(2, 8, 1)], NOW).poor).toBe(false);
  });

  it("treats exactly 6 hours as fine and soreness 3 as fine", () => {
    expect(recoveryStatus([log(0, 6, 3), log(1, 6, 3)], NOW).poor_days).toBe(0);
  });

  it("only looks at the newest three logs", () => {
    const out = recoveryStatus([log(0, 8, 1), log(1, 8, 1), log(2, 8, 1), log(3, 4, 5), log(4, 4, 5)], NOW);
    expect(out.poor).toBe(false);
    expect(out.considered).toBe(3);
  });

  it("ignores logs older than the window and deleted logs", () => {
    const out = recoveryStatus([log(20, 4, 5), log(1, 4, 5, { deleted_at: daysAgo(0) }), log(0, 4, 2)], NOW);
    expect(out).toEqual({ poor: false, poor_days: 1, considered: 1 });
  });

  it("skips fields that were not logged", () => {
    expect(recoveryStatus([log(0, null, null), log(1, null, null)], NOW).poor_days).toBe(0);
  });

  it("is order independent", () => {
    const a = [log(0, 5, 2), log(1, 5, 2), log(2, 8, 1)];
    expect(recoveryStatus([...a].reverse(), NOW)).toEqual(recoveryStatus(a, NOW));
  });

  it("returns an empty status with no logs", () => {
    expect(recoveryStatus([], NOW)).toEqual({ poor: false, poor_days: 0, considered: 0 });
  });
});

describe("plannedSessionsLast28d", () => {
  it("counts only the days the program has existed, up to 28", () => {
    expect(plannedSessionsLast28d(3, 3, daysAgo(0), NOW)).toBe(0);
    expect(plannedSessionsLast28d(3, 3, daysAgo(14), NOW)).toBe(2);
    expect(plannedSessionsLast28d(3, 3, daysAgo(90), NOW)).toBe(4);
    expect(plannedSessionsLast28d(6, 3, daysAgo(7), NOW)).toBe(2);
    expect(plannedSessionsLast28d(3, 3, null, NOW)).toBe(4);
  });
});
