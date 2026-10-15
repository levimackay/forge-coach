import { describe, expect, it } from "vitest";
import { dateRange, equipmentText, fullDate, goalText, num, plural, prescriptionText, programText, setText, shortDate, signed, words } from "./format";

describe("dates", () => {
  it("formats US style without padding", () => {
    expect(shortDate("2026-10-05")).toBe("Oct 5");
    expect(fullDate("2026-01-31")).toBe("Jan 31, 2026");
  });

  it("collapses the year in a range only when both ends share it", () => {
    expect(dateRange("2026-10-09", "2026-10-15")).toBe("Oct 9 to Oct 15, 2026");
    expect(dateRange("2026-12-28", "2027-01-03")).toBe("Dec 28, 2026 to Jan 3, 2027");
  });
});

describe("numbers", () => {
  it("num keeps one decimal at most and drops trailing zeros", () => {
    expect(num(139.333)).toBe("139.3");
    expect(num(5)).toBe("5");
    expect(num(5.04)).toBe("5");
    expect(num(2.5)).toBe("2.5");
  });

  it("never prints negative zero", () => {
    expect(num(-0.04)).toBe("0");
    expect(signed(-0.04)).toBe("0");
  });

  it("signed marks positive and negative", () => {
    expect(signed(6.33)).toBe("+6.3");
    expect(signed(-35)).toBe("-35");
    expect(signed(0)).toBe("0");
    expect(signed(0.04)).toBe("0");
  });

  it("plural", () => {
    expect(plural(1, "day")).toBe("1 day");
    expect(plural(0, "day")).toBe("0 days");
    expect(plural(2, "day")).toBe("2 days");
  });

  it("words replaces underscores", () => {
    expect(words("front_delts")).toBe("front delts");
  });
});

describe("text", () => {
  it("setText by load type", () => {
    expect(setText({ reps: 8, load: 110 }, "external")).toBe("110 x 8");
    expect(setText({ reps: 8, load: null }, "external")).toBe("8 reps");
    expect(setText({ reps: 12, load: 25 }, "bodyweight")).toBe("+25 x 12");
    expect(setText({ reps: 15, load: null }, "bodyweight")).toBe("15 reps");
    expect(setText({ reps: 6, load: 0 }, "bodyweight")).toBe("6 reps");
    expect(setText({ reps: 6, load: 40 }, "assisted")).toBe("6 reps, 40 assist");
  });

  it("prescriptionText", () => {
    expect(prescriptionText({ sets: 3, rep_min: 6, rep_max: 10, target_rir: 2, load: 110 })).toBe("3 x 6 to 10 reps, RIR 2, 110");
    expect(prescriptionText({ sets: 4, rep_min: 8, rep_max: 8, target_rir: 1, load: null })).toBe("4 x 8 reps, RIR 1");
  });

  it("goalText", () => {
    expect(goalText({ kind: "body_composition", description: "Lean out", focus_muscles: [], target_date: null })).toBe("body composition: Lean out");
    expect(goalText({ kind: "hypertrophy", description: "Bigger arms", focus_muscles: ["biceps", "triceps"], target_date: "2026-12-31" })).toBe(
      "hypertrophy: Bigger arms (focus: biceps, triceps), by Dec 31, 2026",
    );
  });

  it("equipmentText", () => {
    expect(
      equipmentText({ name: "Home", is_default: true, equipment: ["dumbbells", "pullup_bar"], dumbbell_increment: 5, dumbbell_max: 50, barbell_increment: null }),
    ).toBe("Home (default): dumbbells, pullup bar; dumbbell step 5, dumbbells up to 50");
    expect(equipmentText({ name: "Gym", is_default: false, equipment: [], dumbbell_increment: null, dumbbell_max: null, barbell_increment: 5 })).toBe(
      "Gym: nothing listed; barbell step 5",
    );
  });

  it("programText lists the days", () => {
    expect(
      programText({
        name: "PPL",
        split: "ppl",
        days_per_week: 3,
        version: 2,
        days: [{ name: "Push A", focus: "push", exercises: [] }],
      }),
    ).toBe("PPL (push/pull/legs), 3 days per week, version 2. Days: Push A (push, 0 exercises)");
  });
});
