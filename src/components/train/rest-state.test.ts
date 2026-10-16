import { describe, expect, it } from "vitest";
import { secondsLeft, spokenClock } from "./rest-state";

describe("secondsLeft", () => {
  it("counts up to the next whole second and never exceeds the rest that was set", () => {
    const rest = { endsAt: 100_000, total: 90 };
    expect(secondsLeft(rest, 10_500)).toBe(90);
    expect(secondsLeft(rest, 40_000)).toBe(60);
    expect(secondsLeft(rest, 99_001)).toBe(1);
    expect(secondsLeft(rest, 100_000)).toBe(0);
    expect(secondsLeft(rest, 105_000)).toBe(-5);
  });
});

describe("spokenClock", () => {
  it("says minutes and seconds", () => {
    expect(spokenClock(151)).toBe("2 minutes 31 seconds left");
    expect(spokenClock(60)).toBe("1 minute left");
    expect(spokenClock(61)).toBe("1 minute 1 second left");
    expect(spokenClock(45)).toBe("45 seconds left");
    expect(spokenClock(0)).toBe("0 seconds left");
  });
});
