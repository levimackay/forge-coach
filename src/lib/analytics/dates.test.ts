import { describe, expect, it } from "vitest";
import { addDays, daysBetween, inRange, localDate, weekStart } from "./dates";

describe("dates", () => {
  it("localDate uses the athlete's timezone, not UTC", () => {
    // 02:00Z on Oct 15 is 20:00 on Oct 14 in Denver (UTC-6 in October).
    expect(localDate("2026-10-15T02:00:00.000Z", "America/Denver")).toBe("2026-10-14");
    expect(localDate("2026-10-15T02:00:00.000Z", "UTC")).toBe("2026-10-15");
  });

  it("localDate falls back to UTC for an unknown zone", () => {
    expect(localDate("2026-10-15T02:00:00.000Z", "Not/AZone")).toBe("2026-10-15");
  });

  it("addDays crosses month and year edges", () => {
    expect(addDays("2026-10-15", -27)).toBe("2026-09-18");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("daysBetween is signed", () => {
    expect(daysBetween("2026-10-09", "2026-10-15")).toBe(6);
    expect(daysBetween("2026-10-15", "2026-10-09")).toBe(-6);
  });

  it("weekStart defaults to Monday; 2026-10-15 is a Thursday", () => {
    expect(weekStart("2026-10-15")).toBe("2026-10-12");
    expect(weekStart("2026-10-12")).toBe("2026-10-12");
    expect(weekStart("2026-10-18")).toBe("2026-10-12");
    expect(weekStart("2026-10-15", 0)).toBe("2026-10-11");
  });

  it("inRange is inclusive", () => {
    expect(inRange("2026-10-09", "2026-10-09", "2026-10-15")).toBe(true);
    expect(inRange("2026-10-15", "2026-10-09", "2026-10-15")).toBe(true);
    expect(inRange("2026-10-16", "2026-10-09", "2026-10-15")).toBe(false);
  });
});
