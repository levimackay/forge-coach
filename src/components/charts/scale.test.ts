import { describe, expect, it } from "vitest";
import { clamp, linear, nearestIndex, niceTicks } from "./scale";

describe("linear", () => {
  it("maps the domain ends to the range ends and interpolates between", () => {
    const f = linear([10, 20], [0, 100]);
    expect(f(10)).toBe(0);
    expect(f(20)).toBe(100);
    expect(f(15)).toBe(50);
  });

  it("supports an inverted range for y axes", () => {
    const f = linear([0, 10], [200, 0]);
    expect(f(0)).toBe(200);
    expect(f(10)).toBe(0);
  });

  it("puts a zero-width domain in the middle", () => {
    expect(linear([5, 5], [0, 100])(5)).toBe(50);
  });
});

describe("niceTicks", () => {
  it("rounds to 1, 2 or 5 steps and covers the data", () => {
    const t = niceTicks(135, 165, 3);
    expect(t.ticks).toEqual([130, 140, 150, 160, 170]);
    expect(t.min).toBe(130);
    expect(t.max).toBe(170);
  });

  it("handles small decimals without float noise", () => {
    const t = niceTicks(0.1, 0.5, 4);
    expect(t.ticks).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
  });

  it("widens a flat series so the line sits in the middle", () => {
    const t = niceTicks(80, 80, 3);
    expect(t.min).toBeLessThan(80);
    expect(t.max).toBeGreaterThan(80);
  });

  it("works around zero and for a flat zero series", () => {
    const zero = niceTicks(0, 0, 3);
    expect(zero.min).toBeLessThan(0);
    expect(zero.max).toBeGreaterThan(0);
    const mixed = niceTicks(-3, 7, 4);
    expect(mixed.ticks[0]).toBeLessThanOrEqual(-3);
    expect(mixed.ticks[mixed.ticks.length - 1]).toBeGreaterThanOrEqual(7);
  });
});

describe("nearestIndex", () => {
  it("picks the closest x, the earlier one on a tie", () => {
    expect(nearestIndex([0, 10, 30], 12)).toBe(1);
    expect(nearestIndex([0, 10, 30], 25)).toBe(2);
    expect(nearestIndex([0, 10], 5)).toBe(0);
    expect(nearestIndex([7], 100)).toBe(0);
  });
});

describe("clamp", () => {
  it("bounds a value", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
});
