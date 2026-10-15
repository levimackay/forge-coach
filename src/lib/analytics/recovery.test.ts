import { describe, expect, it } from "vitest";
import { recoverySummary } from "./recovery";
import { recovery } from "./testkit";

describe("recoverySummary", () => {
  const logs = [
    recovery({ date: "2026-10-12", sleep_hours: 7, sleep_quality: 4, soreness: 2, energy: 4, stress: 2 }),
    recovery({ date: "2026-10-13", sleep_hours: 5.5, sleep_quality: 3, soreness: 4, energy: 3, stress: 3 }),
    recovery({ date: "2026-10-14", sleep_hours: 8, sleep_quality: 5, soreness: 3, energy: 5, stress: 1 }),
    recovery({ date: "2026-10-08", sleep_hours: 4, soreness: 5 }), // outside the window
    recovery({ date: "2026-10-11", sleep_hours: 3, deleted_at: "2026-10-12T00:00:00Z" }),
  ];
  const r = recoverySummary({ logs, from: "2026-10-09", to: "2026-10-15" });

  it("averages the days in the window", () => {
    expect(r.days_in_period).toBe(7);
    expect(r.days_logged).toBe(3);
    expect(r.avg_sleep_hours).toBeCloseTo(6.8333, 4); // 20.5 / 3
    expect(r.avg_sleep_quality).toBe(4);
    expect(r.avg_soreness).toBe(3);
    expect(r.avg_energy).toBe(4);
    expect(r.avg_stress).toBe(2);
  });

  it("counts short nights (under 6 h) and sore days (4 or more)", () => {
    expect(r.short_sleep_nights).toBe(1);
    expect(r.high_soreness_days).toBe(1);
  });

  it("reports the newest log in the window", () => {
    expect(r.latest).toEqual({ date: "2026-10-14", sleep_hours: 8, sleep_quality: 5, soreness: 3, energy: 5, stress: 1 });
  });

  it("averages only the fields that were logged", () => {
    const partial = recoverySummary({
      logs: [recovery({ date: "2026-10-12", sleep_hours: 7 }), recovery({ date: "2026-10-13" }), recovery({ date: "2026-10-14", sleep_hours: 8 })],
      from: "2026-10-09",
      to: "2026-10-15",
    });
    expect(partial.avg_sleep_hours).toBe(7.5);
    expect(partial.avg_energy).toBeNull();
    expect(partial.days_logged).toBe(3);
  });

  it("says nothing was logged when nothing was", () => {
    const empty = recoverySummary({ logs: [], from: "2026-10-09", to: "2026-10-15" });
    expect(empty).toMatchObject({ days_logged: 0, avg_sleep_hours: null, short_sleep_nights: 0, latest: null });
  });
});
