import { describe, expect, it } from "vitest";
import { linear } from "./scale";

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
