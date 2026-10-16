import { describe, expect, it } from "vitest";
import { loadText, repRangeText, restText, sentence, timeAgo } from "./format";

describe("text helpers", () => {
  it("turns snake case into a sentence", () => {
    expect(sentence("front_delts")).toBe("Front delts");
    expect(sentence("push")).toBe("Push");
  });

  it("formats loads, rep ranges and rest", () => {
    expect(loadText(135, "lb")).toBe("135 lb");
    expect(loadText(62.5, "kg")).toBe("62.5 kg");
    expect(loadText(null, "lb")).toBe("Not set");
    expect(loadText(null, "lb", "Bodyweight")).toBe("Bodyweight");
    expect(repRangeText(8, 8)).toBe("8 reps");
    expect(repRangeText(8, 12)).toBe("8 to 12 reps");
    expect(restText(null)).toBe("Not set");
    expect(restText(45)).toBe("45 sec");
    expect(restText(120)).toBe("2 min");
    expect(restText(150)).toBe("2 min 30 sec");
  });
});

describe("timeAgo", () => {
  const now = "2026-10-15T12:00:00.000Z";
  const ago = (ms: number) => new Date(Date.parse(now) - ms).toISOString();

  it("counts up from just now to days", () => {
    expect(timeAgo(ago(20_000), now)).toBe("just now");
    expect(timeAgo(ago(60_000), now)).toBe("1 minute ago");
    expect(timeAgo(ago(5 * 60_000), now)).toBe("5 minutes ago");
    expect(timeAgo(ago(3_600_000), now)).toBe("1 hour ago");
    expect(timeAgo(ago(5 * 3_600_000), now)).toBe("5 hours ago");
    expect(timeAgo(ago(26 * 3_600_000), now)).toBe("1 day ago");
    expect(timeAgo(ago(6 * 86_400_000), now)).toBe("6 days ago");
  });

  it("falls back to a date after two weeks and treats future times as now", () => {
    expect(timeAgo(ago(30 * 86_400_000), now)).toMatch(/Sep/);
    expect(timeAgo("2026-10-15T13:00:00.000Z", now)).toBe("just now");
    expect(timeAgo("not a date", now)).toBe("");
  });
});
