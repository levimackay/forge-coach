import { describe, expect, it } from "vitest";
import { findInProgress, pickNextDay } from "./rotation";

const day = (id: string, position: number, deleted_at: string | null = null) => ({ id, position, deleted_at });
const DAYS = [day("push", 0), day("pull", 1), day("legs", 2)];

const done = (program_day_id: string, completed_at: string) => ({
  program_day_id,
  status: "completed" as const,
  started_at: completed_at,
  completed_at,
  deleted_at: null,
});

describe("pickNextDay", () => {
  it("starts at the first day when nothing is finished", () => {
    expect(pickNextDay(DAYS, [])?.id).toBe("push");
  });

  it("returns null for a program without days", () => {
    expect(pickNextDay([], [])).toBeNull();
  });

  it("moves to the day after the last completed workout and wraps", () => {
    expect(pickNextDay(DAYS, [done("push", "2026-10-12T17:00:00Z")])?.id).toBe("pull");
    expect(pickNextDay(DAYS, [done("push", "2026-10-12T17:00:00Z"), done("pull", "2026-10-14T17:00:00Z")])?.id).toBe("legs");
    expect(pickNextDay(DAYS, [done("legs", "2026-10-14T17:00:00Z")])?.id).toBe("push");
  });

  it("goes by the newest workout, not the order of the list", () => {
    const list = [done("legs", "2026-10-14T17:00:00Z"), done("push", "2026-10-10T17:00:00Z"), done("pull", "2026-10-12T17:00:00Z")];
    expect(pickNextDay(DAYS, list)?.id).toBe("push");
  });

  it("sorts days by position", () => {
    const shuffled = [day("legs", 2), day("push", 0), day("pull", 1)];
    expect(pickNextDay(shuffled, [])?.id).toBe("push");
    expect(pickNextDay(shuffled, [done("push", "2026-10-12T17:00:00Z")])?.id).toBe("pull");
  });

  it("ignores abandoned, in-progress, deleted and other-program workouts", () => {
    const list = [
      done("push", "2026-10-10T17:00:00Z"),
      { ...done("pull", "2026-10-12T17:00:00Z"), status: "abandoned" as const },
      { ...done("pull", "2026-10-13T17:00:00Z"), status: "in_progress" as const, completed_at: null },
      { ...done("pull", "2026-10-13T18:00:00Z"), deleted_at: "2026-10-14T00:00:00Z" },
      done("someone-elses-day", "2026-10-14T17:00:00Z"),
      { ...done("legs", "2026-10-14T18:00:00Z"), program_day_id: null },
    ];
    expect(pickNextDay(DAYS, list)?.id).toBe("pull");
  });

  it("skips deleted days", () => {
    const days = [day("push", 0), day("pull", 1, "2026-10-01T00:00:00Z"), day("legs", 2)];
    expect(pickNextDay(days, [done("push", "2026-10-12T17:00:00Z")])?.id).toBe("legs");
  });

  it("starts over if the last workout's day was removed from the program", () => {
    expect(pickNextDay(DAYS, [done("gone", "2026-10-12T17:00:00Z")])?.id).toBe("push");
  });
});

describe("findInProgress", () => {
  const w = (status: "in_progress" | "completed", started_at: string, deleted_at: string | null = null) => ({
    status,
    started_at,
    deleted_at,
  });

  it("returns the newest unfinished workout", () => {
    const older = w("in_progress", "2026-10-10T10:00:00Z");
    const newer = w("in_progress", "2026-10-12T10:00:00Z");
    expect(findInProgress([older, newer, w("completed", "2026-10-13T10:00:00Z")])).toBe(newer);
  });

  it("returns null when everything is finished or deleted", () => {
    expect(findInProgress([w("completed", "2026-10-13T10:00:00Z"), w("in_progress", "2026-10-13T10:00:00Z", "2026-10-14T00:00:00Z")])).toBeNull();
  });
});
