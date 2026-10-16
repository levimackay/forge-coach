import { describe, expect, it } from "vitest";
import { isHardSet, MUSCLES, weeklyHardSets } from "./volume";
import { exercise, set, workout } from "./testkit";

const TZ = "America/Denver";
const bench = exercise({ name: "Bench", primary_muscle: "chest", secondary_muscles: ["front_delts", "triceps"] });
const pushup = exercise({ name: "Push-up", primary_muscle: "chest", secondary_muscles: ["front_delts", "triceps"], load_type: "bodyweight" });
const odd = exercise({ name: "Odd", primary_muscle: "lats", secondary_muscles: ["biceps", "biceps", "lats"] });
const library = [bench, pushup, odd];

const w1 = workout({ started_at: "2026-10-12T23:00:00.000Z" }); // Mon Oct 12 local
const w2 = workout({ started_at: "2026-10-15T02:00:00.000Z" }); // Wed Oct 14 local
const wOutAfter = workout({ started_at: "2026-10-19T23:00:00.000Z" });
const wOutBefore = workout({ started_at: "2026-10-11T23:00:00.000Z" }); // Sun Oct 11
const wAbandoned = workout({ started_at: "2026-10-13T23:00:00.000Z", status: "abandoned" });
const workouts = [w1, w2, wOutAfter, wOutBefore, wAbandoned];

const s = (wk: { id: string }, ex: { id: string }, o: Parameters<typeof set>[0] extends infer T ? Partial<T> : never = {}) =>
  set({ workout_id: wk.id, exercise_id: ex.id, ...o });

describe("isHardSet", () => {
  it("counts rir 0 to 4 and unlogged rir; not 5 or more", () => {
    expect(isHardSet({ rir: 0 })).toBe(true);
    expect(isHardSet({ rir: 4 })).toBe(true);
    expect(isHardSet({ rir: null })).toBe(true);
    expect(isHardSet({ rir: 5 })).toBe(false);
  });
});

describe("weeklyHardSets", () => {
  const sets = [
    s(w1, bench, { rir: 2, load: 105 }),
    s(w1, bench, { rir: 1, load: 105 }),
    s(w1, bench, { rir: 5, load: 105 }), // too easy
    s(w1, bench, { rir: 4, load: 60, is_warmup: true }), // warmup
    s(w2, bench, { rir: null, load: 110 }),
    s(w2, pushup, { rir: 3 }),
    s(w2, pushup, { rir: 3 }),
    s(w2, pushup, { rir: 3 }),
    s(wOutAfter, bench, { rir: 1 }),
    s(wOutBefore, bench, { rir: 1 }),
    s(wAbandoned, bench, { rir: 1 }),
    s(w2, bench, { rir: 1, deleted_at: "2026-10-16T00:00:00Z" }),
    s(w2, exercise({ name: "Not in library" }), { rir: 1 }),
  ];
  const result = weeklyHardSets({ workouts, sets, exercises: library, weekStart: "2026-10-12", timeZone: TZ });
  const row = (m: string) => result.find((r) => r.muscle === m)!;

  it("returns every muscle, in a stable order", () => {
    expect(result.map((r) => r.muscle)).toEqual(MUSCLES);
    expect(result).toHaveLength(15);
  });

  it("chest: 2 + 1 bench and 3 push-up hard sets = 6 direct", () => {
    expect(row("chest")).toEqual({ muscle: "chest", sets: 6, direct_sets: 6, indirect_sets: 0, sessions: 2 });
  });

  it("secondary muscles count half: 6 sets give 3 to front delts and triceps", () => {
    expect(row("front_delts")).toEqual({ muscle: "front_delts", sets: 3, direct_sets: 0, indirect_sets: 6, sessions: 0 });
    expect(row("triceps").sets).toBe(3);
  });

  it("untouched muscles are zero", () => {
    expect(row("quads")).toEqual({ muscle: "quads", sets: 0, direct_sets: 0, indirect_sets: 0, sessions: 0 });
  });

  it("a muscle listed twice, or as primary and secondary, counts once per set", () => {
    const r = weeklyHardSets({ workouts, sets: [s(w1, odd, { rir: 2 })], exercises: library, weekStart: "2026-10-12", timeZone: TZ });
    expect(r.find((x) => x.muscle === "lats")).toMatchObject({ direct_sets: 1, indirect_sets: 0 });
    expect(r.find((x) => x.muscle === "biceps")).toMatchObject({ indirect_sets: 1, sets: 0.5 });
  });

  it("the window is 7 days from weekStart in local time (Oct 11 and Oct 19 are outside)", () => {
    const next = weeklyHardSets({ workouts, sets, exercises: library, weekStart: "2026-10-19", timeZone: TZ });
    expect(next.find((x) => x.muscle === "chest")!.direct_sets).toBe(1);
  });
});
