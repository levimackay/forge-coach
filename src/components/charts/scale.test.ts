import { describe, expect, it } from "vitest";
import { clamp, labelIndices, linear, nearestIndex } from "./scale";

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

describe("labelIndices", () => {
  const xs = (n: number, step: number) => Array.from({ length: n }, (_, i) => i * step);

  it("labels every entry when they are far enough apart", () => {
    expect([...labelIndices(xs(5, 80), 40)].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it("thins a crowded series from the last entry back, never closer than the gap", () => {
    const picked = [...labelIndices(xs(12, 10), 35)].sort((a, b) => a - b);
    expect(picked).toContain(11);
    for (let i = 1; i < picked.length; i++) expect((picked[i] - picked[i - 1]) * 10).toBeGreaterThanOrEqual(35);
    expect(picked.length).toBeLessThan(12);
  });

  it("always labels the kept entry and drops labels that would touch it", () => {
    const picked = labelIndices(xs(12, 10), 35, 5);
    expect(picked.has(5)).toBe(true);
    for (const i of picked) if (i !== 5) expect(Math.abs(i - 5) * 10).toBeGreaterThanOrEqual(35);
  });
});
