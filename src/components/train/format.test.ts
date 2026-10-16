import { describe, expect, it } from "vitest";
import {
  ALL_EQUIPMENT,
  EQUIPMENT_NAME,
  MUSCLES,
  MUSCLE_LABEL,
  countLabel,
  dayDisplayClass,
  formatClock,
  formatDay,
  formatDuration,
  formatLoad,
  formatMonthDay,
  formatNumber,
  formatPrescription,
  formatRepRange,
  formatWeekday,
} from "./format";

describe("formatNumber and formatLoad", () => {
  it("drops trailing zeros and float noise", () => {
    expect(formatNumber(50)).toBe("50");
    expect(formatNumber(2.5)).toBe("2.5");
    expect(formatNumber(22.499999)).toBe("22.5");
    expect(formatLoad(135, "lb")).toBe("135 lb");
    expect(formatLoad(62.5, "kg")).toBe("62.5 kg");
  });
});

describe("formatPrescription", () => {
  it("states sets, rep range and RIR", () => {
    expect(formatPrescription({ sets: 3, rep_min: 8, rep_max: 12, target_rir: 2 })).toBe("3 sets of 8 to 12 at 2 RIR");
  });

  it("handles one set and a fixed rep count", () => {
    expect(formatPrescription({ sets: 1, rep_min: 5, rep_max: 5, target_rir: 0 })).toBe("1 set of 5 at 0 RIR");
    expect(formatRepRange(5, 5)).toBe("5");
  });
});

describe("formatClock and formatDuration", () => {
  it("formats seconds as m:ss and never goes negative", () => {
    expect(formatClock(75)).toBe("1:15");
    expect(formatClock(9)).toBe("0:09");
    expect(formatClock(-4)).toBe("0:00");
    expect(formatClock(600)).toBe("10:00");
  });

  it("formats minutes with hours when needed", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(60)).toBe("1 h");
    expect(formatDuration(75)).toBe("1 h 15 min");
  });
});

describe("dates", () => {
  it("shows a date-only string on the same calendar day in any timezone", () => {
    expect(formatDay("2026-10-15")).toMatch(/Oct/);
    expect(formatDay("2026-10-15")).toMatch(/15/);
  });
});

describe("dayDisplayClass", () => {
  it("keeps the 120px display for a short day and steps down for a long one", () => {
    expect(dayDisplayClass("Legs")).toBe("text-display");
    expect(dayDisplayClass("Push A")).toBe("text-display");
    expect(dayDisplayClass("Upper A")).toBe("text-fig-88");
    expect(dayDisplayClass("Full body")).toBe("text-fig-72");
    expect(dayDisplayClass("Upper body strength")).toBe("text-fig-48");
  });

  it("counts the period the name will get, but only once", () => {
    expect(dayDisplayClass("Legs.")).toBe(dayDisplayClass("Legs"));
  });
});

describe("short dates for the label column", () => {
  it("gives the month and day, and the weekday, on the same calendar day in any timezone", () => {
    expect(formatMonthDay("2026-10-14T12:00:00Z", { timeZone: "UTC" })).toMatch(/Oct.*14|14.*Oct/);
    expect(formatWeekday("2026-10-14T12:00:00Z", { timeZone: "UTC" })).toMatch(/Wed/);
  });
});

describe("labels", () => {
  it("covers every muscle and equipment code", () => {
    expect(MUSCLES).toHaveLength(15);
    for (const m of MUSCLES) expect(MUSCLE_LABEL[m].length).toBeGreaterThan(2);
    expect(ALL_EQUIPMENT).toHaveLength(12);
    expect(EQUIPMENT_NAME.pullup_bar).toBe("Pull-up bar");
  });

  it("pluralises", () => {
    expect(countLabel(1, "set")).toBe("1 set");
    expect(countLabel(3, "set")).toBe("3 sets");
  });
});
