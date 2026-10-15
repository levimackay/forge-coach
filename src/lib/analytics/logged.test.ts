import { describe, expect, it } from "vitest";
import { loggedWorkSets, sessionMinutes } from "./logged";
import { exercise, set, workout } from "./testkit";

const ex = exercise();

describe("sessionMinutes", () => {
  it("is the span between start and completion in whole minutes", () => {
    expect(sessionMinutes({ started_at: "2026-10-12T23:00:00.000Z", completed_at: "2026-10-12T23:52:30.000Z" })).toBe(53);
  });

  it("is null when unfinished, backwards, or longer than 6 hours", () => {
    expect(sessionMinutes({ started_at: "2026-10-12T23:00:00.000Z", completed_at: null })).toBeNull();
    expect(sessionMinutes({ started_at: "2026-10-12T23:00:00.000Z", completed_at: "2026-10-12T22:00:00.000Z" })).toBeNull();
    expect(sessionMinutes({ started_at: "2026-10-12T23:00:00.000Z", completed_at: "2026-10-13T08:00:00.000Z" })).toBeNull();
    expect(sessionMinutes({ started_at: "2026-10-12T23:00:00.000Z", completed_at: "2026-10-13T05:00:00.000Z" })).toBe(360);
  });
});

describe("loggedWorkSets", () => {
  const early = workout({ started_at: "2026-10-05T23:00:00+00:00" }); // offset form, as Postgres returns it
  const late = workout({ started_at: "2026-10-12T23:00:00.000Z" });
  const sets = [
    set({ workout_id: late.id, exercise_id: ex.id, set_index: 1 }),
    set({ workout_id: late.id, exercise_id: ex.id, set_index: 0 }),
    set({ workout_id: early.id, exercise_id: ex.id, set_index: 0 }),
    set({ workout_id: early.id, exercise_id: ex.id, is_warmup: true }),
    set({ workout_id: early.id, exercise_id: ex.id, reps: 0 }),
    set({ workout_id: early.id, exercise_id: ex.id, deleted_at: "2026-10-06T00:00:00Z" }),
  ];

  it("orders by time then set index, regardless of timestamp format, and drops non-work sets", () => {
    const out = loggedWorkSets([late, early], sets, "America/Denver");
    expect(out.map((l) => [l.workout.id, l.set.set_index])).toEqual([
      [early.id, 0],
      [late.id, 0],
      [late.id, 1],
    ]);
    expect(out[0].date).toBe("2026-10-05");
  });

  it("orders sets within a workout by completion time before set index", () => {
    const w = workout();
    const a = set({ workout_id: w.id, exercise_id: ex.id, set_index: 0, completed_at: "2026-10-12T23:20:00.000Z" });
    const b = set({ workout_id: w.id, exercise_id: ex.id, set_index: 0, completed_at: "2026-10-12T23:05:00.000Z" });
    expect(loggedWorkSets([w], [a, b], "UTC").map((l) => l.set.id)).toEqual([b.id, a.id]);
  });

  it("drops sets of unfinished, abandoned and deleted workouts", () => {
    const inProgress = workout({ status: "in_progress" });
    const deleted = workout({ deleted_at: "2026-10-13T00:00:00Z" });
    const more = [inProgress, deleted].map((w) => set({ workout_id: w.id, exercise_id: ex.id }));
    expect(loggedWorkSets([inProgress, deleted], more, "UTC")).toEqual([]);
  });
});
