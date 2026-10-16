import { describe, expect, it } from "vitest";
import { ENGINE_CONFIG, decideNext } from "@/lib/engine";
import { BENCH, makeInput, makeSets, session } from "@/lib/engine/testkit";
import { EFFORTS, EFFORT_RIR, SESSION_RPE, effortForRir, type Effort } from "./effort";

const TARGETS = [0, 1, 2, 3, 4];

describe("EFFORT_RIR", () => {
  it("makes Good exactly the plan's target", () => {
    for (const target of TARGETS) expect(EFFORT_RIR.good(target)).toBe(target);
  });

  it("makes Hard a set at or next to failure, and Easy clearly above the target", () => {
    for (const target of TARGETS) {
      expect(EFFORT_RIR.hard(target)).toBe(0);
      expect(EFFORT_RIR.easy(target)).toBe(target + 2);
    }
    expect(EFFORT_RIR.easy(10)).toBe(10);
  });

  it("orders the words from easiest to hardest", () => {
    for (const target of TARGETS) {
      expect(EFFORT_RIR.easy(target)).toBeGreaterThanOrEqual(EFFORT_RIR.good(target));
      expect(EFFORT_RIR.good(target)).toBeGreaterThanOrEqual(EFFORT_RIR.hard(target));
    }
  });

  it("always stays inside what the database accepts", () => {
    for (const effort of EFFORTS) for (const target of [0, 5, 10]) {
      const rir = EFFORT_RIR[effort](target);
      expect(rir).toBeGreaterThanOrEqual(0);
      expect(rir).toBeLessThanOrEqual(10);
    }
  });
});

describe("what the engine does with each word", () => {
  // Three sets at the top of the rep range, each rated with the word, on a plan that asks for 2 in reserve.
  const decideAfter = (effort: Effort, target = 2) =>
    decideNext(
      makeInput({
        prescription: { rep_min: 6, rep_max: 10, target_rir: target, load: 100 },
        history: [session(3, makeSets([10, 10, 10], { load: 100, rir: EFFORT_RIR[effort](target), exercise: BENCH.id }))],
      }),
    );

  it("adds weight after Good and after Easy", () => {
    expect(decideAfter("good").action).toBe("increase_load");
    expect(decideAfter("easy").action).toBe("increase_load");
  });

  it("holds the weight after Hard on a plan that asks for 2 in reserve", () => {
    const d = decideAfter("hard");
    expect(d.action).toBe("hold");
    expect(d.inputs.rule).toBe("ceiling_effort_high");
  });

  it("counts Hard as too hard exactly when the engine's tolerance says a set is", () => {
    for (const target of TARGETS) {
      const tooHard = EFFORT_RIR.hard(target) < target - ENGINE_CONFIG.rirTolerance;
      expect(decideAfter("hard", target).action === "hold").toBe(tooHard);
      expect(decideAfter("good", target).action).toBe("increase_load");
    }
  });
});

describe("effortForRir", () => {
  it("reads back the word that wrote a value", () => {
    for (const target of [1, 2, 3]) for (const effort of EFFORTS) {
      expect(effortForRir(EFFORT_RIR[effort](target), target)).toBe(effort);
    }
  });

  it("puts a value between two words on Good", () => {
    expect(effortForRir(1, 2)).toBe("good");
    expect(effortForRir(3, 2)).toBe("good");
  });

  it("reads failure as Good when the plan itself asks for failure", () => {
    expect(effortForRir(0, 0)).toBe("good");
  });
});

describe("SESSION_RPE", () => {
  it("rises with the word and stays on the 1 to 10 scale", () => {
    expect(SESSION_RPE.easy).toBeLessThan(SESSION_RPE.good);
    expect(SESSION_RPE.good).toBeLessThan(SESSION_RPE.hard);
    for (const effort of EFFORTS) {
      expect(SESSION_RPE[effort]).toBeGreaterThanOrEqual(1);
      expect(SESSION_RPE[effort]).toBeLessThanOrEqual(10);
    }
  });
});
