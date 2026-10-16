import { describe, expect, it } from "vitest";
import { isUsable, ladderStep, loadIncrement, missingEquipment, substituteForEquipment } from "./ladder";
import {
  ASSISTED, BENCH, CABLE_ROW, DB_CURL, DB_PRESS, GOBLET, GYM, HOTEL, LIBRARY, PU_ARCHER, PU_DECLINE, PU_INCLINE, PU_STD,
  PU_WEIGHTED, SQUAT, makeEquipment, makeExercise,
} from "./testkit";

describe("missingEquipment", () => {
  it("lists only what the profile lacks, in exercise order", () => {
    expect(missingEquipment(BENCH, HOTEL)).toEqual(["barbell", "rack"]);
  });
  it("never asks for bodyweight", () => {
    expect(missingEquipment(PU_STD, makeEquipment({ equipment: [] }))).toEqual([]);
  });
  it("treats a missing profile as everything available", () => {
    expect(missingEquipment(BENCH, null)).toEqual([]);
    expect(isUsable(BENCH, null)).toBe(true);
  });
  it("is satisfied by a full gym", () => {
    expect(isUsable(BENCH, GYM)).toBe(true);
  });
});

describe("substituteForEquipment", () => {
  it("swaps a barbell press for the dumbbell press with the same pattern and muscle", () => {
    expect(substituteForEquipment(BENCH, LIBRARY, HOTEL)?.id).toBe(DB_PRESS.id);
  });

  it("returns null when nothing in the library fits", () => {
    expect(substituteForEquipment(CABLE_ROW, LIBRARY, makeEquipment({ equipment: [] }))).toBeNull();
  });

  it("never returns the exercise itself", () => {
    expect(substituteForEquipment(DB_CURL, [DB_CURL], GYM)).toBeNull();
  });

  it("never picks a deleted exercise", () => {
    const gone = { ...DB_PRESS, deleted_at: "2026-02-01T00:00:00.000Z" };
    const lib = LIBRARY.map((e) => (e.id === DB_PRESS.id ? gone : e));
    expect(substituteForEquipment(BENCH, lib, HOTEL)?.id).not.toBe(DB_PRESS.id);
  });

  it("requires the same movement pattern and primary muscle", () => {
    const sub = substituteForEquipment(SQUAT, LIBRARY, HOTEL);
    expect(sub?.id).toBe(GOBLET.id);
    expect(sub?.movement_pattern).toBe("squat");
    expect(sub?.primary_muscle).toBe("quads");
  });

  const rung = (level: number, equipment: Parameters<typeof makeExercise>[0]["equipment"], slug = `r${level}`) =>
    makeExercise({ id: `x-${slug}`, slug, name: slug, movement_pattern: "horizontal_pull", primary_muscle: "upper_back", progression_group: "row", ladder_level: level, equipment });
  const alt = makeExercise({ id: "x-alt", slug: "alt", name: "alt", movement_pattern: "horizontal_pull", primary_muscle: "upper_back", equipment: ["dumbbells"] });

  it("prefers the same ladder at the nearest level over an unrelated match", () => {
    const l1 = rung(1, ["dumbbells"]);
    const l2 = rung(2, ["bands"]);
    const l3 = rung(3, ["rings"]);
    const eq = makeEquipment({ equipment: ["dumbbells", "bands"] });
    expect(substituteForEquipment(l3, [l1, l2, l3, alt], eq)?.id).toBe(l2.id);
  });

  it("falls back along the ladder when the nearest rung is unavailable", () => {
    const l1 = rung(1, ["dumbbells"]);
    const l2 = rung(2, ["rings"]);
    const l3 = rung(3, ["rings"]);
    expect(substituteForEquipment(l3, [l1, l2, l3, alt], makeEquipment({ equipment: ["dumbbells"] }))?.id).toBe(l1.id);
  });

  it("breaks an equal-distance tie toward the easier rung", () => {
    const l2 = rung(2, ["rings"]);
    const l1 = rung(1, ["bands"]);
    const l3 = rung(3, ["bands"]);
    expect(substituteForEquipment(l2, [l3, l1, l2], makeEquipment({ equipment: ["bands"] }))?.id).toBe(l1.id);
  });

  it("breaks a full tie by slug so library order never matters", () => {
    const a = makeExercise({ id: "x-a", slug: "aaa", name: "a", movement_pattern: "calf", primary_muscle: "calves", equipment: ["machines"], load_type: "external" });
    const b = { ...a, id: "x-b", slug: "bbb", name: "b" };
    const orig = { ...a, id: "x-o", slug: "orig", equipment: ["barbell" as const] };
    const eq = makeEquipment({ equipment: ["machines"] });
    expect(substituteForEquipment(orig, [b, a, orig], eq)?.id).toBe("x-a");
    expect(substituteForEquipment(orig, [orig, a, b], eq)?.id).toBe("x-a");
  });
});

describe("ladderStep", () => {
  it("steps up and down the ladder", () => {
    expect(ladderStep(PU_STD, LIBRARY, null, 1)?.id).toBe(PU_DECLINE.id);
    expect(ladderStep(PU_STD, LIBRARY, null, -1)?.id).toBe(PU_INCLINE.id);
  });
  it("returns null at the top and bottom", () => {
    expect(ladderStep(PU_WEIGHTED, LIBRARY, null, 1)).toBeNull();
    expect(ladderStep(PU_INCLINE, LIBRARY, null, -1)).toBeNull();
  });
  it("returns null for an exercise that is not on a ladder", () => {
    expect(ladderStep(BENCH, LIBRARY, GYM, 1)).toBeNull();
    expect(ladderStep(ASSISTED, LIBRARY, GYM, -1)).toBeNull();
  });
  it("skips rungs the equipment cannot do", () => {
    const r = (level: number, equipment: Parameters<typeof makeExercise>[0]["equipment"]) =>
      makeExercise({ id: `y${level}`, slug: `y${level}`, name: `y${level}`, progression_group: "g", ladder_level: level, equipment });
    const lib = [r(1, ["bodyweight"]), r(2, ["rings"]), r(3, ["bodyweight"])];
    expect(ladderStep(lib[0], lib, makeEquipment({ equipment: [] }), 1)?.id).toBe("y3");
    expect(ladderStep(lib[0], lib, makeEquipment({ equipment: ["rings"] }), 1)?.id).toBe("y2");
  });
  it("ignores deleted rungs", () => {
    const lib = LIBRARY.map((e) => (e.id === PU_DECLINE.id ? { ...e, deleted_at: "2026-02-01T00:00:00.000Z" } : e));
    expect(ladderStep(PU_STD, lib, null, 1)?.id).toBe(PU_ARCHER.id);
  });
});

describe("loadIncrement", () => {
  it("uses the config default per unit for dumbbells", () => {
    expect(loadIncrement(DB_CURL, null, "lb")).toBe(5);
    expect(loadIncrement(DB_CURL, null, "kg")).toBe(2.5);
  });
  it("prefers the equipment profile over the exercise default", () => {
    const eq = makeEquipment({ equipment: ["dumbbells"], dumbbell_increment: 2.5 });
    expect(loadIncrement({ ...DB_CURL, default_increment: 10 }, eq, "lb")).toBe(2.5);
  });
  it("falls back to the exercise default when the profile value is unusable", () => {
    for (const bad of [0, -5, Number.NaN]) {
      const eq = makeEquipment({ equipment: ["dumbbells"], dumbbell_increment: bad });
      expect(loadIncrement({ ...DB_CURL, default_increment: 7.5 }, eq, "lb")).toBe(7.5);
    }
  });
  it("steps barbells 5 lb upper and 10 lb lower, 2.5 kg and 5 kg", () => {
    expect(loadIncrement(BENCH, null, "lb")).toBe(5);
    expect(loadIncrement(SQUAT, null, "lb")).toBe(10);
    expect(loadIncrement(BENCH, null, "kg")).toBe(2.5);
    expect(loadIncrement(SQUAT, null, "kg")).toBe(5);
  });
  it("honours a barbell increment from the profile (micro plates)", () => {
    expect(loadIncrement(BENCH, makeEquipment({ equipment: ["barbell"], barbell_increment: 2.5 }), "lb")).toBe(2.5);
  });
  it("uses the exercise's own step for machines and cables", () => {
    expect(loadIncrement(CABLE_ROW, null, "lb")).toBe(5);
    expect(loadIncrement({ ...CABLE_ROW, default_increment: 10 }, null, "lb")).toBe(10);
  });
  it("uses kettlebell jumps", () => {
    const kb = makeExercise({ id: "kb", slug: "kb", name: "kb", equipment: ["kettlebells"], load_type: "external" });
    expect(loadIncrement(kb, null, "lb")).toBe(8);
    expect(loadIncrement(kb, null, "kg")).toBe(4);
  });
  it("converts the exercise's own step, stored in pounds, for kg athletes", () => {
    const seeded = (p: Partial<typeof BENCH>) => ({ ...BENCH, ...p });
    expect(loadIncrement(seeded({ default_increment: 5 }), null, "kg")).toBe(2.5);
    expect(loadIncrement({ ...SQUAT, default_increment: 10 }, null, "kg")).toBe(5);
    expect(loadIncrement({ ...CABLE_ROW, default_increment: 10 }, null, "kg")).toBe(5);
    expect(loadIncrement({ ...PU_WEIGHTED, default_increment: 5 }, null, "kg")).toBe(2.5);
    expect(loadIncrement({ ...SQUAT, default_increment: 10 }, null, "lb")).toBe(10);
    // A profile step is already in the athlete's unit.
    const eq = makeEquipment({ equipment: ["barbell"], barbell_increment: 2.5 });
    expect(loadIncrement(seeded({ default_increment: 5 }), eq, "kg")).toBe(2.5);
    expect(loadIncrement({ ...DB_CURL, default_increment: 5 }, makeEquipment({ equipment: ["dumbbells"], dumbbell_increment: 2 }), "kg")).toBe(2);
  });
  it("has a small default for weighted bodyweight work", () => {
    expect(loadIncrement(PU_WEIGHTED, null, "lb")).toBe(5);
    expect(loadIncrement(PU_WEIGHTED, null, "kg")).toBe(2.5);
  });
});
