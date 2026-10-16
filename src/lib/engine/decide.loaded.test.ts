import { describe, expect, it } from "vitest";
import { decideNext, repCeiling } from "./decide";
import {
  ASSISTED, DB_CURL, GYM, LIBRARY, PL_BAND, PL_WEIGHTED, SQUAT, isOneSentence, makeEquipment, makeExercise, makeInput, makeSets,
  session, warmup,
} from "./testkit";

const rir2 = { load: 100, rir: 2 };

describe("loads that ride on bodyweight", () => {
  const BAND = { ...PL_BAND, load_type: "assisted" as const };
  const weighted = (added: number, bodyweight?: number) =>
    decideNext(
      makeInput({
        exercise: PL_WEIGHTED,
        prescription: { rep_min: 5, rep_max: 10, load: added },
        bodyweight,
        history: [session(3, makeSets([10, 10, 10], { load: added, rir: 2, exercise: PL_WEIGHTED.id }))],
      }),
    );

  it("measures a weighted rung's jump against bodyweight plus the added weight", () => {
    const d = weighted(10, 180);
    expect(d.action).toBe("increase_load");
    expect(d.after.load).toBe(15);
    expect(d.inputs.effective_rep_max).toBe(10);
    expect(d.inputs.jump_pct).toBe(2.63);
  });

  it("does not stretch the rep ceiling when bodyweight is unknown", () => {
    const d = weighted(10);
    expect(d.action).toBe("increase_load");
    expect(d.inputs.effective_rep_max).toBe(10);
  });

  it("measures assisted work against bodyweight minus the assistance", () => {
    const d = decideNext(
      makeInput({
        exercise: BAND,
        prescription: { rep_min: 6, rep_max: 12, load: 20 },
        bodyweight: 180,
        history: [session(3, makeSets([12, 12, 12], { load: 20, rir: 2, exercise: BAND.id }))],
      }),
    );
    expect(d.action).toBe("increase_load");
    expect(d.after.load).toBe(15);
    expect(d.inputs.effective_rep_max).toBe(12);
  });

  it("keeps the ceiling the plan shows in step with the engine", () => {
    const args = { exercise: PL_WEIGHTED, library: LIBRARY, equipment: null, unit: "lb" as const, load: 10, rep_max: 10 };
    expect(repCeiling({ ...args, bodyweight: 180 })).toBe(10);
  });

  it("still stretches the ceiling for a big jump on an ordinary lift", () => {
    const d = decideNext(
      makeInput({
        exercise: DB_CURL,
        prescription: { load: 20 },
        bodyweight: 180,
        history: [session(3, makeSets([12, 12, 12], { load: 20, rir: 2, exercise: DB_CURL.id }))],
      }),
    );
    expect(d.action).toBe("increase_reps");
    expect(d.inputs.effective_rep_max).toBe(22);
  });
});

describe("kg athletes", () => {
  it("steps a seeded barbell lift by kilograms, not by its pound increment", () => {
    const squat = { ...SQUAT, default_increment: 10 };
    const d = decideNext(
      makeInput({
        exercise: squat,
        unit: "kg",
        equipment: GYM,
        prescription: { load: 100 },
        history: [session(3, makeSets([10, 10, 10], { load: 100, rir: 2, exercise: squat.id }))],
      }),
    );
    expect(d.action).toBe("increase_load");
    expect(d.after.load).toBe(105);
  });
});

describe("double progression on external load", () => {
  it("raises barbell load by the upper-body step when every set hits rep_max at target RIR", () => {
    const d = decideNext(makeInput({ history: [session(3, makeSets([10, 10, 10], rir2))] }));
    expect(d.action).toBe("increase_load");
    expect(d.after.load).toBe(105);
    expect(d.reason).toBe("You hit 10 reps on all 3 sets at 2 RIR, so the bar goes up to 105 lb.");
  });

  it("matches the documented dumbbell example", () => {
    const equipment = makeEquipment({ equipment: ["dumbbells"], dumbbell_increment: 2.5 });
    const d = decideNext(
      makeInput({
        exercise: DB_CURL,
        prescription: { load: 27.5 },
        equipment,
        history: [session(3, makeSets([12, 12, 12], { load: 27.5, rir: 2, exercise: DB_CURL.id }))],
      }),
    );
    expect(d.action).toBe("increase_load");
    expect(d.after.load).toBe(30);
    expect(d.reason).toBe("You hit 12 reps on all 3 sets at 2 RIR, so the dumbbells go up to 30 lb.");
  });

  it("uses the lower-body step for squats", () => {
    const d = decideNext(
      makeInput({ exercise: SQUAT, prescription: { load: 200 }, history: [session(3, makeSets([10, 10, 10], { load: 200, rir: 2, exercise: SQUAT.id }))] }),
    );
    expect(d.after.load).toBe(210);
  });

  it("uses kilogram steps and labels", () => {
    const upper = decideNext(makeInput({ unit: "kg", prescription: { load: 80 }, history: [session(3, makeSets([10, 10, 10], { load: 80, rir: 2 }))] }));
    expect(upper.after.load).toBe(82.5);
    expect(upper.reason).toContain("82.5 kg");
    const lower = decideNext(
      makeInput({ exercise: SQUAT, unit: "kg", prescription: { load: 100 }, history: [session(3, makeSets([10, 10, 10], { load: 100, rir: 2, exercise: SQUAT.id }))] }),
    );
    expect(lower.after.load).toBe(105);
  });

  it("honours micro plates from the equipment profile", () => {
    const equipment = makeEquipment({ equipment: ["barbell", "bench", "rack"], barbell_increment: 1.25 });
    const d = decideNext(makeInput({ unit: "kg", equipment, prescription: { load: 60 }, history: [session(3, makeSets([10, 10, 10], { load: 60, rir: 2 }))] }));
    expect(d.after.load).toBe(61.25);
  });

  it("reports the spread when RIR differs between sets", () => {
    const d = decideNext(makeInput({ history: [session(3, makeSets([10, 11, 10], { load: 100, rir: [1, 2, 3] }))] }));
    expect(d.action).toBe("increase_load");
    expect(d.reason).toBe("You hit 10 or more reps on all 3 sets at 1 to 3 RIR, so the bar goes up to 105 lb.");
  });

  it("does not raise load while any set is below rep_max", () => {
    const d = decideNext(makeInput({ history: [session(3, makeSets([10, 10, 9], rir2))] }));
    expect(d.action).toBe("increase_reps");
    expect(d.after.load).toBe(100);
  });

  it("asks for one more rep on the lowest set while inside the range", () => {
    const d = decideNext(makeInput({ history: [session(3, makeSets([8, 8, 7], rir2))] }));
    expect(d.action).toBe("increase_reps");
    expect(d.inputs.target_reps).toBe(8);
    expect(d.after).toEqual(d.before);
    expect(d.reason).toBe("You did 8, 8, 7 reps at 100 lb, so aim for 8 reps on every set before the weight goes up.");
  });

  it("tracks the weight actually lifted when it differs from the plan", () => {
    const d = decideNext(makeInput({ history: [session(3, makeSets([8, 8, 8], { load: 95, rir: 2 }))] }));
    expect(d.action).toBe("increase_reps");
    expect(d.after.load).toBe(95);
  });

  it("increases from the performed load, not the planned one", () => {
    const d = decideNext(makeInput({ history: [session(3, makeSets([10, 10, 10], { load: 110, rir: 2 }))] }));
    expect(d.after.load).toBe(115);
  });

  it("falls back to the planned load when sets carry none", () => {
    const d = decideNext(makeInput({ history: [session(3, makeSets([10, 10, 10], { load: null, rir: 2 }))] }));
    expect(d.action).toBe("increase_load");
    expect(d.after.load).toBe(105);
  });

  it("treats a load far from the plan as a logging mistake", () => {
    for (const logged of [1000, 30]) {
      const d = decideNext(makeInput({ history: [session(3, makeSets([10, 10, 10], { load: logged, rir: 2 }))] }));
      expect(d.action).toBe("hold");
      expect(d.inputs.rule).toBe("load_mismatch");
      expect(d.after.load).toBe(100);
      expect(d.reason).toContain(`${logged} lb`);
    }
  });

  it("holds when the session was trained on a different exercise", () => {
    const d = decideNext(makeInput({ history: [session(3, makeSets([10, 10, 10], { ...rir2, exercise: "ex-db-press" }))] }));
    expect(d.action).toBe("hold");
    expect(d.reason).toBe("You trained Dumbbell Bench Press instead of Barbell Bench Press, so Barbell Bench Press stays the same.");
  });

  it("holds an unfinished session without drawing conclusions", () => {
    const d = decideNext(makeInput({ history: [session(3, makeSets([10, 10], rir2))] }));
    expect(d.action).toBe("hold");
    expect(d.reason).toBe("You logged 2 of 3 sets, so 100 lb stays the same until you finish them all.");
  });

  it("holds when the weight changed between sets", () => {
    const sets = makeSets([10, 10, 10], rir2);
    sets[2].load = 90;
    const d = decideNext(makeInput({ history: [session(3, sets)] }));
    expect(d.action).toBe("hold");
    expect(d.inputs.rule).toBe("mixed_loads");
  });

  it("falls back to rep progression when no weight is known anywhere", () => {
    const d = decideNext(makeInput({ prescription: { load: null }, history: [session(3, makeSets([10, 10, 10], { load: null, rir: 2 }))] }));
    expect(d.action).toBe("increase_reps");
    expect(d.after.load).toBeNull();
    expect(d.reason).not.toContain("lb");
  });
});

describe("fixed dumbbell jumps", () => {
  const stretch = (load: number, reps: number[], extra: Parameters<typeof makeInput>[0] = {}) =>
    decideNext(
      makeInput({ exercise: DB_CURL, prescription: { load }, history: [session(3, makeSets(reps, { load, rir: 2, exercise: DB_CURL.id }))], ...extra }),
    );

  it("stretches the rep ceiling before a jump over 10%", () => {
    const d = stretch(25, [12, 12, 12]);
    expect(d.action).toBe("increase_reps");
    expect(d.inputs.effective_rep_max).toBe(20);
    expect(d.inputs.target_reps).toBe(13);
    expect(d.after.load).toBe(25);
    expect(d.after.rep_max).toBe(12);
  });

  it("makes the jump once every set reaches the stretched ceiling", () => {
    const d = stretch(25, [20, 20, 20]);
    expect(d.action).toBe("increase_load");
    expect(d.after.load).toBe(30);
    expect(d.reason).toBe("You hit 20 reps on all 3 sets at 2 RIR, so the dumbbells go up to 30 lb.");
  });

  it("keeps stretching while one set is short of the ceiling", () => {
    const d = stretch(25, [20, 20, 19]);
    expect(d.action).toBe("increase_reps");
    expect(d.inputs.target_reps).toBe(20);
  });

  it("ignores RIR on the stretched high-rep sets", () => {
    const d = decideNext(
      makeInput({ exercise: DB_CURL, prescription: { load: 25 }, history: [session(3, makeSets([20, 20, 20], { load: 25, rir: 0, exercise: DB_CURL.id }))] }),
    );
    expect(d.action).toBe("increase_load");
  });

  it("jumps straight away when the step is exactly 10%", () => {
    const equipment = makeEquipment({ equipment: ["dumbbells"], dumbbell_increment: 2.5 });
    const d = stretch(25, [12, 12, 12], { equipment });
    expect(d.action).toBe("increase_load");
    expect(d.after.load).toBe(27.5);
  });

  it("stretches when the step is just over 10%", () => {
    const equipment = makeEquipment({ equipment: ["dumbbells"], dumbbell_increment: 2.5 });
    const d = stretch(24, [12, 12, 12], { equipment });
    expect(d.action).toBe("increase_reps");
    expect(d.inputs.effective_rep_max).toBe(17);
  });

  it("caps the stretched ceiling at 30 reps", () => {
    const d = stretch(10, [12, 12, 12]);
    expect(d.inputs.effective_rep_max).toBe(30);
    expect(d.action).toBe("increase_reps");
  });

  it("never plans a dumbbell heavier than the heaviest one owned", () => {
    const equipment = makeEquipment({ equipment: ["dumbbells"], dumbbell_increment: 5, dumbbell_max: 50 });
    const climbing = stretch(50, [12, 12, 12], { equipment });
    expect(climbing.action).toBe("increase_reps");
    expect(climbing.reason).toContain("50 lb is as heavy as it goes");
    const capped = stretch(50, [30, 30, 30], { equipment });
    expect(capped.action).toBe("hold");
    expect(capped.after.load).toBe(50);
    expect(capped.reason).toContain("nothing heavier or harder left");
  });

  it("moves up the ladder at the heaviest dumbbell when a harder variation exists", () => {
    const base = { equipment: ["dumbbells" as const], load_type: "external" as const, progression_group: "db-squat" };
    const goblet = makeExercise({ id: "g1", slug: "g1", name: "Dumbbell Squat", movement_pattern: "squat", primary_muscle: "quads", ladder_level: 1, ...base });
    const split = makeExercise({ id: "g2", slug: "g2", name: "Dumbbell Split Squat", movement_pattern: "lunge", primary_muscle: "quads", ladder_level: 2, ...base });
    const equipment = makeEquipment({ equipment: ["dumbbells"], dumbbell_max: 50 });
    const d = decideNext(
      makeInput({
        exercise: goblet,
        library: [goblet, split],
        equipment,
        prescription: { load: 50 },
        history: [session(3, makeSets([12, 12, 12], { load: 50, rir: 2, exercise: "g1" }))],
      }),
    );
    expect(d.action).toBe("advance_variation");
    expect(d.after.exercise_id).toBe("g2");
    expect(d.after.load).toBeNull();
  });
});

describe("effort (RIR) handling", () => {
  const at = (rir: number | null | (number | null)[], target = 2, reps = [10, 10, 10]) =>
    decideNext(makeInput({ prescription: { target_rir: target }, history: [session(3, makeSets(reps, { load: 100, rir }))] }));

  it("holds when a set at the ceiling was far harder than the target", () => {
    const d = at([2, 2, 0]);
    expect(d.action).toBe("hold");
    expect(d.reason).toBe("You hit 10 reps on all 3 sets but 1 set ended at 0 RIR against a target of 2, so 100 lb stays the same until the effort comes down.");
  });

  it("accepts one rep of reserve below the target", () => {
    expect(at(1).action).toBe("increase_load");
  });

  it.each([
    [3, 1, "hold"],
    [3, 2, "increase_load"],
    [1, 0, "increase_load"],
    [0, 0, "increase_load"],
  ])("target RIR %i with reported RIR %i -> %s", (target, rir, expected) => {
    expect(at(rir, target).action).toBe(expected);
  });

  it("will not raise load when RIR is missing until the ceiling repeats at the same load", () => {
    const first = decideNext(makeInput({ history: [session(3, makeSets([10, 10, 10], { load: 100, rir: null }))] }));
    expect(first.action).toBe("hold");
    expect(first.inputs.rule).toBe("ceiling_rir_unconfirmed");
    const confirmed = decideNext(
      makeInput({
        history: [session(3, makeSets([10, 10, 10], { load: 100, rir: null })), session(10, makeSets([10, 10, 10], { load: 100, rir: null }))],
      }),
    );
    expect(confirmed.action).toBe("increase_load");
  });

  it("does not count a repeat at a different load as confirmation", () => {
    const d = decideNext(
      makeInput({
        history: [session(3, makeSets([10, 10, 10], { load: 100, rir: null })), session(10, makeSets([10, 10, 10], { load: 95, rir: null }))],
      }),
    );
    expect(d.action).toBe("hold");
  });

  it("treats a single unlogged set as missing RIR", () => {
    expect(at([2, null, 2]).inputs.rule).toBe("ceiling_rir_unconfirmed");
  });

  it("ignores RIR entirely above 12 reps", () => {
    const d = decideNext(
      makeInput({ prescription: { rep_min: 12, rep_max: 15 }, history: [session(3, makeSets([15, 15, 15], { load: 100, rir: 0 }))] }),
    );
    expect(d.action).toBe("increase_load");
  });

  it("holds in range when sets were already near failure", () => {
    const d = at([0, 0, 0], 2, [8, 8, 8]);
    expect(d.action).toBe("hold");
    expect(d.reason).toBe("3 sets ended at 0 RIR against a target of 2, so 100 lb stays the same until the effort comes down.");
  });

  it("does not hold in range for missing RIR", () => {
    expect(at(null, 2, [8, 8, 8]).action).toBe("increase_reps");
  });
});

describe("warmups and extra sets", () => {
  it("ignores warmup sets completely", () => {
    const sets = [warmup(3, 135, "ex-bench", 0), ...makeSets([10, 10, 10], rir2)];
    const d = decideNext(makeInput({ history: [session(3, sets)] }));
    expect(d.action).toBe("increase_load");
    expect(d.after.load).toBe(105);
  });

  it("does not let a low-rep warmup count as a missed floor", () => {
    const sets = [warmup(2, 60, "ex-bench", 0), ...makeSets([8, 8, 8], rir2)];
    expect(decideNext(makeInput({ history: [session(3, sets)] })).action).toBe("increase_reps");
  });

  it("treats a session of only warmups as no history", () => {
    const d = decideNext(makeInput({ history: [session(3, [warmup(5, 60), warmup(3, 100)])] }));
    expect(d.inputs.rule).toBe("no_history");
  });

  it("judges only as many work sets as were prescribed", () => {
    const d = decideNext(makeInput({ history: [session(3, makeSets([10, 10, 10, 4], rir2))] }));
    expect(d.action).toBe("increase_load");
  });
});

describe("assisted exercises", () => {
  const assisted = (reps: number[], load: number, extra: Parameters<typeof makeInput>[0] = {}) =>
    decideNext(
      makeInput({
        exercise: ASSISTED,
        equipment: GYM,
        prescription: { load },
        history: [session(3, makeSets(reps, { load, rir: 2, exercise: "ex-assisted" }))],
        ...extra,
      }),
    );

  it("lowers the assistance when every set hits the top of the range", () => {
    const d = assisted([10, 10, 10], 60);
    expect(d.action).toBe("increase_load");
    expect(d.after.load).toBe(55);
    expect(d.reason).toBe("You hit 10 reps on all 3 sets at 2 RIR, so the assistance drops to 55 lb.");
  });

  it("climbs in reps once there is no assistance left to remove", () => {
    const d = assisted([10, 10, 10], 0);
    expect(d.action).toBe("increase_reps");
    expect(d.inputs.target_reps).toBe(11);
  });

  it("reads the least assistance across sets as the working load", () => {
    const sets = makeSets([10, 10, 10], { load: 60, rir: 2, exercise: "ex-assisted" });
    sets[0].load = 70;
    const d = decideNext(makeInput({ exercise: ASSISTED, prescription: { load: 60 }, history: [session(3, sets)] }));
    expect(d.inputs.baseline_load).toBe(60);
  });
});

describe("decision shape", () => {
  it("always returns before, after, a one-sentence reason and JSON-safe inputs", () => {
    const inputs = [
      makeInput({ history: [session(3, makeSets([10, 10, 10], rir2))] }),
      makeInput({ history: [session(3, makeSets([8, 8, 7], rir2))] }),
      makeInput({ history: [session(3, makeSets([10, 10], rir2))] }),
      makeInput({ history: [] }),
      makeInput({ history: [session(3, makeSets([4, 4, 4], rir2))] }),
    ];
    for (const input of inputs) {
      const d = decideNext(input);
      expect(isOneSentence(d.reason)).toBe(true);
      expect(d.before.exercise_id).toBe(input.planned.exercise_id);
      expect(JSON.parse(JSON.stringify(d.inputs))).toEqual(d.inputs);
      expect(d.inputs.unit).toBe("lb");
    }
  });

  it("includes the real numbers in the reason", () => {
    const d = decideNext(makeInput({ history: [session(3, makeSets([10, 10, 10], rir2))] }));
    expect(d.reason).toMatch(/\d/);
    expect(d.reason).toContain("105 lb");
  });

  it("records the sets it judged", () => {
    const d = decideNext(makeInput({ history: [session(3, makeSets([10, 10, 10], rir2))] }));
    expect(d.inputs.sets_logged).toEqual([
      { reps: 10, load: 100, rir: 2 },
      { reps: 10, load: 100, rir: 2 },
      { reps: 10, load: 100, rir: 2 },
    ]);
  });
});
