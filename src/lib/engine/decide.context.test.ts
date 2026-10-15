import { describe, expect, it } from "vitest";
import { decideNext } from "./decide";
import {
  ASSISTED, BENCH, CABLE_ROW, DB_CURL, DB_PRESS, GYM, HOTEL, PU_INCLINE, PU_STD, daysAgo, deepFreeze, isOneSentence,
  makeEquipment, makeInput, makeSets, session,
} from "./testkit";

const top = (days: number, extra: Parameters<typeof makeSets>[1] = {}) => session(days, makeSets([10, 10, 10], { load: 100, rir: 2, ...extra }));

describe("pain", () => {
  it("never increases and keeps the plan as it is", () => {
    const d = decideNext(makeInput({ history: [session(3, makeSets([10, 10, 10], { load: 100, rir: 2, pain: [false, true, false] }))] }));
    expect(d.action).toBe("pain_hold");
    expect(d.after).toEqual(d.before);
    expect(d.reason).toBe("You flagged pain on 1 set of Barbell Bench Press, so it stays at 100 lb with no increase until a session is pain free.");
  });

  it("counts every flagged set", () => {
    const d = decideNext(makeInput({ history: [session(3, makeSets([10, 10, 10], { load: 100, rir: 2, pain: [true, true, false] }))] }));
    expect(d.reason).toContain("2 sets");
  });

  it("takes a pain flag on a warmup seriously", () => {
    const sets = makeSets([10, 10, 10], { load: 100, rir: 2 });
    sets.unshift({ exercise_id: BENCH.id, set_index: 0, reps: 8, load: 60, rir: null, is_warmup: true, pain: true });
    expect(decideNext(makeInput({ history: [session(3, sets)] })).action).toBe("pain_hold");
  });

  it("beats a ceiling hit, a stall and poor recovery", () => {
    const pain = { pain: [true, false, false] };
    expect(decideNext(makeInput({ history: [top(3, pain)] })).action).toBe("pain_hold");
    expect(decideNext(makeInput({ history: [session(3, makeSets([5, 5, 5], { load: 100, pain: [true] })), top(7)] })).action).toBe("pain_hold");
  });

  it("only looks at the newest session", () => {
    const d = decideNext(makeInput({ history: [top(3), top(7, { pain: [true, false, false] })] }));
    expect(d.action).toBe("increase_load");
  });

  it("holds bodyweight work as planned", () => {
    const sets = makeSets([12, 12, 12], { load: null, exercise: PU_STD.id, pain: [false, false, true] });
    const d = decideNext(makeInput({ exercise: PU_STD, history: [session(3, sets)] }));
    expect(d.action).toBe("pain_hold");
    expect(d.reason).toBe("You flagged pain on 1 set of Push-Up, so it stays as planned with no increase until a session is pain free.");
  });

  it("sees pain flagged in a later session that had only warmups", () => {
    // The previous decision held without changing the plan, so the plan is older than both sessions.
    const warmupOnly = session(0, [{ exercise_id: BENCH.id, set_index: 0, reps: 8, load: 60, rir: null, is_warmup: true, pain: true }]);
    const d = decideNext(makeInput({ history: [warmupOnly, top(4)] }));
    expect(d.action).toBe("pain_hold");
    expect(d.after).toEqual(d.before);
    expect(d.inputs.pain_sets).toBe(1);
  });

  it("is not cleared by a later session of pain-free warmups only", () => {
    const warmupOnly = session(0, [{ exercise_id: BENCH.id, set_index: 0, reps: 8, load: 60, rir: null, is_warmup: true, pain: false }]);
    const d = decideNext(makeInput({ history: [warmupOnly, top(4, { pain: [true, false, false] })] }));
    expect(d.action).toBe("pain_hold");
  });

  it("still applies after the plan was updated", () => {
    const history = [session(3, makeSets([10, 10, 10], { load: 100, rir: 2, pain: [true] }))];
    const d = decideNext(makeInput({ history, planned: { ...makeInput().planned, updated_at: daysAgo(0) } }));
    expect(d.action).toBe("pain_hold");
  });
});

describe("long gaps", () => {
  // The plan already carries a 105 lb increase from the last session at 100 lb.
  const pending = (days: number, extra: Parameters<typeof makeInput>[0] = {}) =>
    decideNext(makeInput({ prescription: { load: 105 }, history: [top(days)], consistency: { days_since_last_session: days, sessions_last_28d: 2, planned_last_28d: 4 }, ...extra }));

  it("does nothing special up to a week off", () => {
    const d = pending(7, { planned: { ...makeInput().planned, load: 105, updated_at: daysAgo(0) } });
    expect(d.inputs.rule).toBe("plan_already_updated");
    expect(d.after.load).toBe(105);
  });

  it.each([8, 14])("after %i days cancels the pending increase", (days) => {
    const d = pending(days);
    expect(d.action).toBe("reduce_after_gap");
    expect(d.after.load).toBe(100);
    expect(d.reason).toBe(`It has been ${days} days since your last session, so the weight goes back to 100 lb instead of increasing.`);
  });

  it("repeats the load when there is nothing to cancel", () => {
    const d = decideNext(makeInput({ history: [top(10)], consistency: { days_since_last_session: 10, sessions_last_28d: 2, planned_last_28d: 4 } }));
    expect(d.action).toBe("hold");
    expect(d.reason).toBe("It has been 10 days since your last session, so repeat 100 lb with no increase.");
  });

  it.each([
    [15, 90, 10],
    [28, 90, 10],
    [29, 85, 15],
    [56, 85, 15],
    [57, 75, 25],
    [120, 75, 25],
  ])("after %i days the load drops to %f (%i%%)", (days, load, pct) => {
    const d = pending(days);
    expect(d.action).toBe("reduce_after_gap");
    expect(d.after.load).toBe(load);
    expect(d.reason).toBe(`It has been ${days} days since your last session, so the load drops ${pct}% to ${load} lb to ease back in.`);
  });

  it("rounds the cut down to a loadable weight", () => {
    const bench = decideNext(makeInput({ prescription: { load: 135 }, history: [session(20, makeSets([10, 10, 10], { load: 135, rir: 2 }))] }));
    expect(bench.after.load).toBe(120);
    const curl = decideNext(
      makeInput({ exercise: DB_CURL, prescription: { load: 25 }, history: [session(20, makeSets([10, 10, 10], { load: 25, rir: 2, exercise: DB_CURL.id }))] }),
    );
    expect(curl.after.load).toBe(20);
  });

  it("cuts in kilograms", () => {
    const d = decideNext(makeInput({ unit: "kg", prescription: { load: 80 }, history: [session(20, makeSets([10, 10, 10], { load: 80, rir: 2 }))] }));
    expect(d.after.load).toBe(70);
    expect(d.reason).toContain("70 kg");
  });

  it("cuts from the lower of the planned and performed loads", () => {
    const d = decideNext(makeInput({ prescription: { load: 90 }, history: [top(20)] }));
    expect(d.after.load).toBe(80);
  });

  it("ignores a logged weight that looks like a typo when cutting", () => {
    const d = decideNext(makeInput({ history: [session(20, makeSets([10, 10, 10], { load: 10, rir: 2 }))] }));
    expect(d.after.load).toBe(90);
  });

  it("rejects a clock that is not a date", () => {
    expect(() => decideNext(makeInput({ now: "yesterday" }))).toThrow(/ISO date-time/);
  });

  it("works from the day's gap when the exercise has no history", () => {
    const d = decideNext(makeInput({ history: [], consistency: { days_since_last_session: 20, sessions_last_28d: 1, planned_last_28d: 4 } }));
    expect(d.action).toBe("reduce_after_gap");
    expect(d.after.load).toBe(90);
  });

  it("uses whichever gap is longer, the day's or the exercise's", () => {
    const d = decideNext(makeInput({ history: [top(20)], consistency: { days_since_last_session: 5, sessions_last_28d: 3, planned_last_28d: 4 } }));
    expect(d.action).toBe("reduce_after_gap");
    expect(d.inputs.gap_days).toBe(20);
  });

  it("does not guess a load for an exercise that never had one", () => {
    const d = decideNext(makeInput({ prescription: { load: null }, history: [], consistency: { days_since_last_session: 30, sessions_last_28d: 0, planned_last_28d: 4 } }));
    expect(d.inputs.rule).toBe("no_history");
  });

  it("gives assisted work more help after a long break", () => {
    const d = decideNext(
      makeInput({ exercise: ASSISTED, equipment: GYM, prescription: { load: 40 }, history: [session(20, makeSets([8, 8, 8], { load: 40, rir: 2, exercise: ASSISTED.id }))] }),
    );
    expect(d.after.load).toBe(45);
    expect(d.reason).toContain("the assistance rises 13% to 45 lb");
  });

  it("states the cut that rounding to the equipment's step really makes", () => {
    const dumbbells = makeEquipment({ equipment: ["dumbbells"], dumbbell_increment: 5 });
    const d = decideNext(
      makeInput({
        exercise: DB_CURL,
        equipment: dumbbells,
        prescription: { load: 20 },
        history: [session(20, makeSets([12, 12, 12], { load: 20, rir: 2, exercise: DB_CURL.id }))],
      }),
    );
    expect(d.action).toBe("reduce_after_gap");
    expect(d.after.load).toBe(15);
    expect(d.reason).toContain("the load drops 25% to 15 lb");
    expect(d.inputs).toMatchObject({ cut_pct: 0.1, actual_cut_pct: 0.25 });
  });

  describe("bodyweight", () => {
    const run = (days: number, exercise = PU_STD) =>
      decideNext(makeInput({ exercise, history: [session(days, makeSets([12, 12, 12], { load: null, exercise: exercise.id }))] }));
    it("carries on after a short break", () => {
      expect(run(10).inputs.rule).not.toMatch(/^gap/);
    });
    it("repeats the last reps after a few weeks off", () => {
      const d = run(30);
      expect(d.action).toBe("hold");
      expect(d.inputs.rule).toBe("gap_repeat_reps");
    });
    it("steps back one variation after more than 56 days", () => {
      const d = run(57);
      expect(d.action).toBe("regress_variation");
      expect(d.after.exercise_id).toBe(PU_INCLINE.id);
      expect(d.reason).toBe("It has been 57 days since your last session, so step back to Incline Push-Up.");
    });
    it("holds at the bottom rung", () => {
      expect(run(90, PU_INCLINE).action).toBe("hold");
    });
  });
});

describe("recovery trend", () => {
  const poor = [
    { date: "2026-10-15", sleep_hours: 5, soreness: 2 },
    { date: "2026-10-14", sleep_hours: 8, soreness: 4 },
    { date: "2026-10-13", sleep_hours: 8, soreness: 1 },
  ];

  it("holds instead of increasing load", () => {
    const d = decideNext(makeInput({ history: [top(3)], recovery: poor }));
    expect(d.action).toBe("hold");
    expect(d.after.load).toBe(100);
    expect(d.reason).toBe("Your last 3 recovery logs show 2 poor days (under 6 hours of sleep or soreness of 4 or more), so 100 lb stays the same instead of going up.");
  });

  it("holds instead of advancing a variation", () => {
    const d = decideNext(makeInput({ exercise: PU_STD, history: [session(3, makeSets([20, 20, 20], { load: null, exercise: PU_STD.id }))], recovery: poor }));
    expect(d.action).toBe("hold");
    expect(d.after.exercise_id).toBe(PU_STD.id);
  });

  it("does not stop the chase for one more rep", () => {
    const d = decideNext(makeInput({ history: [session(3, makeSets([8, 8, 7], { load: 100, rir: 2 }))], recovery: poor }));
    expect(d.action).toBe("increase_reps");
  });

  it("ignores a single bad night", () => {
    const d = decideNext(makeInput({ history: [top(3)], recovery: poor.slice(0, 1) }));
    expect(d.action).toBe("increase_load");
  });

  it("ignores logs that are too old to matter", () => {
    const old = poor.map((l, i) => ({ ...l, date: daysAgo(20 + i).slice(0, 10) }));
    expect(decideNext(makeInput({ history: [top(3)], recovery: old })).action).toBe("increase_load");
  });
});

describe("consistency", () => {
  const withSessions = (done: number, planned: number) =>
    decideNext(makeInput({ history: [top(3)], consistency: { days_since_last_session: 3, sessions_last_28d: done, planned_last_28d: planned } }));

  it("holds when most planned sessions were missed", () => {
    const d = withSessions(3, 12);
    expect(d.action).toBe("hold");
    expect(d.reason).toBe("You finished 3 of 12 planned sessions in the last 28 days, so 100 lb stays the same instead of going up.");
  });

  it("allows an increase at exactly half", () => {
    expect(withSessions(6, 12).action).toBe("increase_load");
  });

  it("needs enough planned sessions to judge", () => {
    expect(withSessions(0, 3).action).toBe("increase_load");
    expect(withSessions(0, 0).action).toBe("increase_load");
  });
});

describe("equipment", () => {
  it("swaps in a matching exercise when the profile lacks the equipment", () => {
    const d = decideNext(makeInput({ equipment: HOTEL, history: [top(3)] }));
    expect(d.action).toBe("substitute_equipment");
    expect(d.after).toEqual({ exercise_id: DB_PRESS.id, sets: 3, rep_min: 8, rep_max: 12, target_rir: 2, load: null });
    expect(d.reason).toBe("Barbell Bench Press needs a barbell and a rack, which Hotel gym does not have, so use Dumbbell Bench Press instead.");
    expect(d.inputs.missing_equipment).toEqual(["barbell", "rack"]);
  });

  it("holds when nothing in the library fits", () => {
    const d = decideNext(makeInput({ exercise: CABLE_ROW, prescription: { load: 50 }, equipment: HOTEL }));
    expect(d.action).toBe("hold");
    expect(d.after).toEqual(d.before);
    expect(d.reason).toBe("Cable Row needs a cable station, which Hotel gym does not have, and nothing in your library matches it, so the plan stays as it is.");
  });

  it("assumes everything is available without a profile", () => {
    expect(decideNext(makeInput({ equipment: null, history: [top(3)] })).action).toBe("increase_load");
  });

  it("never asks for equipment on a bodyweight exercise", () => {
    const empty = makeEquipment({ equipment: [] });
    const d = decideNext(makeInput({ exercise: PU_STD, equipment: empty }));
    expect(d.action).not.toBe("substitute_equipment");
  });

  it("comes before pain", () => {
    const d = decideNext(makeInput({ equipment: HOTEL, history: [session(3, makeSets([10, 10, 10], { load: 100, pain: [true] }))] }));
    expect(d.action).toBe("substitute_equipment");
  });

  it("progresses normally when the profile has everything", () => {
    expect(decideNext(makeInput({ equipment: GYM, history: [top(3)] })).action).toBe("increase_load");
  });
});

describe("no history", () => {
  it("holds with the starting prescription", () => {
    const d = decideNext(makeInput({ history: [] }));
    expect(d.action).toBe("hold");
    expect(d.after).toEqual(d.before);
    expect(d.reason).toBe("No finished sessions are logged for Barbell Bench Press yet, so it starts at 100 lb for 3 sets of 6 to 10.");
  });

  it("describes unloaded work without a weight", () => {
    const d = decideNext(makeInput({ exercise: PU_STD, history: [] }));
    expect(d.reason).toBe("No finished sessions are logged for Push-Up yet, so it starts at 3 sets of 8 to 20.");
  });
});

describe("a plan that already reflects the last session", () => {
  const history = [top(3)];
  const stamped = (updated_at: string) => makeInput({ history, planned: { ...makeInput().planned, updated_at } });

  it("does not progress the same session twice", () => {
    const first = decideNext(makeInput({ history }));
    expect(first.action).toBe("increase_load");
    const again = decideNext(makeInput({ history, prescription: { load: first.after.load }, planned: { ...makeInput().planned, load: first.after.load, updated_at: daysAgo(0) } }));
    expect(again.action).toBe("hold");
    expect(again.inputs.rule).toBe("plan_already_updated");
    expect(again.after.load).toBe(105);
  });

  it("treats an update at the same instant as already applied", () => {
    expect(decideNext(stamped(daysAgo(3))).inputs.rule).toBe("plan_already_updated");
  });

  it("evaluates when the plan was last touched before the session", () => {
    expect(decideNext(stamped(daysAgo(10))).action).toBe("increase_load");
  });
});

describe("determinism and purity", () => {
  const input = makeInput({
    history: [top(3), top(10, { load: 95 })],
    recovery: [{ date: "2026-10-15", sleep_hours: 7, soreness: 2 }],
    equipment: GYM,
  });

  it("returns the same decision for the same input", () => {
    expect(decideNext(input)).toEqual(decideNext(input));
    expect(decideNext(structuredClone(input))).toEqual(decideNext(input));
  });

  it("does not mutate its input", () => {
    const frozen = deepFreeze(structuredClone(input));
    expect(() => decideNext(frozen)).not.toThrow();
  });

  it("does not depend on the order of the history array", () => {
    const shuffled = { ...input, history: [...input.history].reverse() };
    expect(decideNext(shuffled)).toEqual(decideNext(input));
  });

  it("does not depend on the order of sets within a session", () => {
    const flipped = { ...input, history: input.history.map((s) => ({ ...s, sets: [...s.sets].reverse() })) };
    expect(decideNext(flipped)).toEqual(decideNext(input));
  });

  it("uses the supplied clock, not the real one", () => {
    const later = { ...input, now: "2027-01-01T00:00:00.000Z" };
    expect(decideNext(later).inputs.gap_days).toBeGreaterThan(60);
    expect(decideNext(input).inputs.gap_days).toBe(3);
  });
});

describe("reasons", () => {
  const scenarios = [
    makeInput({ history: [top(3)] }),
    makeInput({ history: [session(3, makeSets([8, 8, 7], { load: 100, rir: 2 }))] }),
    makeInput({ history: [session(3, makeSets([4, 4, 4], { load: 100, rir: 0 })), top(7)] }),
    makeInput({ history: [session(3, makeSets([5, 5, 5], { load: 100 })), session(7, makeSets([5, 5, 5], { load: 100 }))] }),
    makeInput({ history: [top(20)] }),
    makeInput({ equipment: HOTEL }),
    makeInput({ history: [session(3, makeSets([10, 10, 10], { load: 100, pain: [true] }))] }),
    makeInput({ exercise: PU_STD, history: [session(3, makeSets([20, 20, 20], { load: null, exercise: PU_STD.id }))] }),
    makeInput({ history: [] }),
  ];

  it.each(scenarios.map((s, i) => [i, s] as const))("scenario %i is one plain sentence", (_i, s) => {
    const d = decideNext(s);
    expect(isOneSentence(d.reason)).toBe(true);
    expect(d.reason).not.toMatch(/undefined|null|NaN|\[object/);
  });

  it("states the actual numbers behind progress and cuts", () => {
    for (const s of [scenarios[0], scenarios[1], scenarios[2], scenarios[3], scenarios[4]]) {
      expect(decideNext(s).reason).toMatch(/\d/);
    }
  });
});
