import { describe, expect, it } from "vitest";
import { consistency } from "./consistency";
import { workout } from "./testkit";

const TZ = "America/Denver";
const workouts = [
  workout({ started_at: "2026-10-12T23:00:00.000Z" }), // Oct 12
  workout({ started_at: "2026-10-15T02:00:00.000Z" }), // Oct 14 local
  workout({ started_at: "2026-10-15T03:00:00.000Z" }), // Oct 14 local, second session
  workout({ started_at: "2026-10-13T23:00:00.000Z", status: "abandoned" }),
  workout({ started_at: "2026-10-05T23:00:00.000Z" }), // before the week
  workout({ started_at: "2026-10-10T23:00:00.000Z", deleted_at: "2026-10-11T00:00:00Z" }),
  workout({ started_at: "2026-10-15T20:00:00.000Z", status: "in_progress" }),
];

describe("consistency", () => {
  const week = consistency({ workouts, daysPerWeek: 3, from: "2026-10-09", to: "2026-10-15", timeZone: TZ });

  it("counts completed sessions, not abandoned, deleted or in progress", () => {
    expect(week.days).toBe(7);
    expect(week.completed).toBe(3);
    expect(week.abandoned).toBe(1);
  });

  it("adherence is completed over prorated plan", () => {
    expect(week.planned).toBe(3);
    expect(week.adherence).toBe(1);
  });

  it("training days are distinct local dates; gap is days between them", () => {
    expect(week.training_days).toBe(2);
    expect(week.longest_gap_days).toBe(2);
  });

  it("days since last is measured to the end of the window", () => {
    expect(week.days_since_last).toBe(1);
  });

  it("prorates the plan over longer and shorter windows", () => {
    expect(consistency({ workouts, daysPerWeek: 3, from: "2026-09-18", to: "2026-10-15", timeZone: TZ }).planned).toBe(12);
    expect(consistency({ workouts, daysPerWeek: 4, from: "2026-10-13", to: "2026-10-15", timeZone: TZ }).planned).toBe(2);
  });

  it("has no plan, and no adherence, without a program", () => {
    const r = consistency({ workouts, daysPerWeek: null, from: "2026-10-09", to: "2026-10-15", timeZone: TZ });
    expect(r.planned).toBeNull();
    expect(r.adherence).toBeNull();
    expect(consistency({ workouts, daysPerWeek: 0, from: "2026-10-09", to: "2026-10-15", timeZone: TZ }).adherence).toBeNull();
  });

  it("empty window: zero completed, no gap, days since last reaches back before the window", () => {
    const r = consistency({ workouts, daysPerWeek: 3, from: "2026-10-06", to: "2026-10-09", timeZone: TZ });
    expect(r.completed).toBe(0);
    expect(r.longest_gap_days).toBeNull();
    expect(r.days_since_last).toBe(4); // Oct 5 to Oct 9
  });

  it("no workouts at all", () => {
    const r = consistency({ workouts: [], daysPerWeek: 3, from: "2026-10-09", to: "2026-10-15", timeZone: TZ });
    expect(r).toMatchObject({ completed: 0, adherence: 0, days_since_last: null, longest_gap_days: null });
  });
});
