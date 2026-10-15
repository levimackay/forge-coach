import { describe, expect, it } from "vitest";
import { decideNext } from "./decide";
import {
  LIBRARY, PL_PULLUP, PL_WEIGHTED, PU_ARCHER, PU_DECLINE, PU_INCLINE, PU_STD, PU_WEIGHTED, makeEquipment, makeExercise,
  makeInput, makeSets, session,
} from "./testkit";

const bw = (reps: number[], rir: number | null = null, exercise = PU_STD.id) => makeSets(reps, { load: null, rir, exercise });
const pushUps = (history: ReturnType<typeof session>[], extra: Parameters<typeof makeInput>[0] = {}) =>
  decideNext(makeInput({ exercise: PU_STD, history, ...extra }));

describe("bodyweight ladders: advancing", () => {
  it("keeps adding reps below the ceiling", () => {
    const d = pushUps([session(3, bw([14, 13, 13]))]);
    expect(d.action).toBe("increase_reps");
    expect(d.inputs.target_reps).toBe(14);
    expect(d.after).toEqual(d.before);
    expect(d.reason).toBe("You did 14, 13, 13 reps, so aim for 14 reps on every set before moving to a harder variation.");
  });

  it("moves up a rung once every set reaches the ceiling and keeps the rep range", () => {
    const d = pushUps([session(3, bw([20, 20, 20], 2))]);
    expect(d.action).toBe("advance_variation");
    expect(d.after.exercise_id).toBe(PU_DECLINE.id);
    expect(d.after.load).toBeNull();
    expect([d.after.rep_min, d.after.rep_max]).toEqual([8, 20]);
    expect(d.reason).toBe("You hit 20 reps on all 3 sets at 2 RIR, so move up to Decline Push-Up and start again from 8 reps.");
  });

  it("advances when reps exceed the ceiling on some sets", () => {
    const d = pushUps([session(3, bw([22, 21, 20]))]);
    expect(d.action).toBe("advance_variation");
    expect(d.reason).toBe("You hit 20 or more reps on all 3 sets, so move up to Decline Push-Up and start again from 8 reps.");
  });

  it("waits while one set is a rep short", () => {
    const d = pushUps([session(3, bw([20, 20, 19]))]);
    expect(d.action).toBe("increase_reps");
    expect(d.inputs.target_reps).toBe(20);
  });

  it("can advance into a weighted rung and starts it with no load", () => {
    const d = decideNext(makeInput({ exercise: PU_ARCHER, history: [session(3, bw([20, 20, 20], null, PU_ARCHER.id))] }));
    expect(d.after.exercise_id).toBe(PU_WEIGHTED.id);
    expect(d.after.load).toBeNull();
  });

  it("clamps an oversized rep_max to 30 reps", () => {
    const d = pushUps([session(3, bw([30, 30, 30]))], { prescription: { rep_max: 40 } });
    expect(d.action).toBe("advance_variation");
    expect(d.inputs.effective_rep_max).toBe(30);
  });

  it("skips rungs the equipment cannot do", () => {
    const rung = (level: number, equipment: Parameters<typeof makeExercise>[0]["equipment"]) =>
      makeExercise({ id: `r${level}`, slug: `r${level}`, name: `Rung ${level}`, progression_group: "g", ladder_level: level, equipment, default_rep_max: 20 });
    const lib = [rung(1, ["bodyweight"]), rung(2, ["rings"]), rung(3, ["bodyweight"])];
    const d = decideNext(
      makeInput({ exercise: lib[0], library: lib, equipment: makeEquipment({ equipment: ["dumbbells"] }), history: [session(3, bw([20, 20, 20], null, "r1"))] }),
    );
    expect(d.after.exercise_id).toBe("r3");
  });

  it("climbs to 30 reps when no harder variation exists, then holds", () => {
    const lib = LIBRARY.filter((e) => e.id !== PU_WEIGHTED.id);
    const climbing = decideNext(makeInput({ exercise: PU_ARCHER, library: lib, history: [session(3, bw([20, 20, 20], null, PU_ARCHER.id))] }));
    expect(climbing.action).toBe("increase_reps");
    expect(climbing.inputs.target_reps).toBe(21);
    const capped = decideNext(makeInput({ exercise: PU_ARCHER, library: lib, history: [session(3, bw([30, 30, 30], null, PU_ARCHER.id))] }));
    expect(capped.action).toBe("hold");
    expect(capped.reason).toBe("You hit 30 reps on all 3 sets and there is nothing heavier or harder left to move to, so Archer Push-Up stays the same.");
  });

  it("applies the RIR gate when the ceiling is low enough to trust it", () => {
    const prescription = { rep_min: 5, rep_max: 8 };
    const tooHard = decideNext(makeInput({ exercise: PL_PULLUP, prescription, history: [session(3, bw([8, 8, 8], 0, PL_PULLUP.id))] }));
    expect(tooHard.action).toBe("hold");
    expect(tooHard.inputs.rule).toBe("ceiling_effort_high");
    const ok = decideNext(makeInput({ exercise: PL_PULLUP, prescription, history: [session(3, bw([8, 8, 8], 1, PL_PULLUP.id))] }));
    expect(ok.action).toBe("advance_variation");
    expect(ok.after.exercise_id).toBe(PL_WEIGHTED.id);
  });

  it("ignores any loads that were logged on a bodyweight exercise", () => {
    const sets = makeSets([20, 20, 20], { load: 10, rir: null, exercise: PU_STD.id });
    const d = pushUps([session(3, sets)]);
    expect(d.action).toBe("advance_variation");
    expect(d.after.load).toBeNull();
  });
});

describe("bodyweight ladders: each rung has its own rep range", () => {
  const leg = (level: number, slug: string, name: string, min: number, max: number) =>
    makeExercise({ id: `ex-${slug}`, slug, name, primary_muscle: "quads", movement_pattern: "lunge", progression_group: "bodyweight-leg", ladder_level: level, default_rep_min: min, default_rep_max: max });
  const BULGARIAN = leg(3, "bulgarian-split-squat", "Bulgarian Split Squat", 8, 15);
  const SHRIMP = leg(4, "shrimp-squat", "Shrimp Squat", 4, 10);
  const PISTOL = leg(5, "pistol-squat", "Pistol Squat", 3, 8);
  const legs = [BULGARIAN, SHRIMP, PISTOL];
  const legSets = (reps: number[], ex: typeof BULGARIAN) => makeSets(reps, { load: null, rir: null, exercise: ex.id });

  it("advances into the harder rung's lower range and says where to start", () => {
    const d = decideNext(makeInput({ exercise: BULGARIAN, library: legs, history: [session(3, legSets([15, 15, 15], BULGARIAN))] }));
    expect(d.action).toBe("advance_variation");
    expect(d.after).toMatchObject({ exercise_id: SHRIMP.id, rep_min: 4, rep_max: 10, load: null });
    expect(d.reason).toBe("You hit 15 reps on all 3 sets, so move up to Shrimp Squat and start again from 4 reps.");
    expect(d.inputs.target_reps).toBe(4);
  });

  it("does not bounce back: the new rung is judged against its own range", () => {
    const shrimp = { exercise: SHRIMP, library: legs, prescription: { rep_min: 4, rep_max: 10 } };
    const d = decideNext(makeInput({ ...shrimp, history: [session(3, legSets([5, 4, 4], SHRIMP)), session(7, legSets([5, 5, 4], SHRIMP))] }));
    expect(d.action).toBe("increase_reps");
  });

  it("regresses into the easier rung's range after a stall", () => {
    const shrimp = { exercise: SHRIMP, library: legs, prescription: { rep_min: 4, rep_max: 10 } };
    const d = decideNext(makeInput({ ...shrimp, history: [session(3, legSets([3, 3, 3], SHRIMP)), session(7, legSets([3, 3, 2], SHRIMP))] }));
    expect(d.action).toBe("regress_variation");
    expect(d.after).toMatchObject({ exercise_id: BULGARIAN.id, rep_min: 8, rep_max: 15 });
  });

  it("regresses into the easier rung's range after a long break", () => {
    const shrimp = { exercise: SHRIMP, library: legs, prescription: { rep_min: 4, rep_max: 10 } };
    const d = decideNext(makeInput({ ...shrimp, history: [session(60, legSets([8, 8, 8], SHRIMP))] }));
    expect(d.action).toBe("regress_variation");
    expect(d.after).toMatchObject({ exercise_id: BULGARIAN.id, rep_min: 8, rep_max: 15 });
  });

  it("keeps the current range when moving onto a weighted rung", () => {
    const d = decideNext(makeInput({ exercise: PU_ARCHER, history: [session(3, bw([20, 20, 20], null, PU_ARCHER.id))] }));
    expect(d.after).toMatchObject({ exercise_id: PU_WEIGHTED.id, rep_min: 8, rep_max: 20 });
  });
});

describe("bodyweight ladders: regressing", () => {
  it("holds after one session under the floor", () => {
    const d = pushUps([session(3, bw([8, 8, 6]))]);
    expect(d.action).toBe("hold");
    expect(d.reason).toBe("Your lowest set was 6 reps against a minimum of 8, so Push-Up stays the same until every set reaches 8.");
  });

  it("drops a rung after two sessions under the floor", () => {
    const d = pushUps([session(3, bw([8, 7, 6])), session(7, bw([8, 8, 7]))]);
    expect(d.action).toBe("regress_variation");
    expect(d.after.exercise_id).toBe(PU_INCLINE.id);
    expect(d.after.load).toBeNull();
    expect(d.reason).toBe("You finished under 8 reps for 2 sessions in a row, so drop back to Incline Push-Up and build up again.");
  });

  it("drops a rung after a plateau mid-range", () => {
    const d = pushUps([session(3, bw([10, 10, 10])), session(7, bw([10, 10, 10])), session(11, bw([10, 10, 10]))]);
    expect(d.action).toBe("regress_variation");
    expect(d.reason).toContain("made no progress for 2 sessions in a row");
  });

  it("holds at the bottom rung because there is nothing easier", () => {
    const d = decideNext(
      makeInput({ exercise: PU_INCLINE, history: [session(3, bw([6, 6, 6], null, PU_INCLINE.id)), session(7, bw([7, 6, 6], null, PU_INCLINE.id))] }),
    );
    expect(d.action).toBe("hold");
    expect(d.inputs.rule).toBe("stall_no_easier_option");
  });

  it("does not compare a new variation with sessions of the old one", () => {
    const history = [
      session(3, bw([12, 12, 12], null, PU_DECLINE.id)),
      session(7, bw([12, 12, 12], null, PU_STD.id)),
      session(11, bw([12, 12, 12], null, PU_STD.id)),
    ];
    const d = decideNext(makeInput({ exercise: PU_DECLINE, history }));
    expect(d.action).toBe("increase_reps");
    expect(d.inputs.stall_streak).toBe(0);
  });

  it("still holds on a miss in the first session of a new variation", () => {
    const history = [session(3, bw([8, 7, 6], null, PU_DECLINE.id)), session(7, bw([20, 20, 20], null, PU_STD.id))];
    const d = decideNext(makeInput({ exercise: PU_DECLINE, history }));
    expect(d.action).toBe("hold");
    expect(d.inputs.stall_streak).toBe(1);
  });

  it("stays put when recovery is poor", () => {
    const d = pushUps([session(3, bw([8, 7, 6])), session(7, bw([8, 8, 7]))], {
      recovery: [
        { date: "2026-10-15", sleep_hours: 5, soreness: 1 },
        { date: "2026-10-14", sleep_hours: 5, soreness: 1 },
      ],
    });
    expect(d.action).toBe("hold");
    expect(d.after.exercise_id).toBe(PU_STD.id);
  });
});
