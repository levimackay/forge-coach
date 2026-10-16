import { describe, expect, it } from "vitest";
import { clamp, decimalsOf, formatNumber, parseNumber, stepValue } from "./number-math";

describe("stepValue", () => {
  it("steps by the increment without float drift", () => {
    expect(stepValue(2.5, 1, { step: 2.5 })).toBe(5);
    expect(stepValue(0.1, 1, { step: 0.1 })).toBe(0.2);
    expect(stepValue(135, -1, { step: 5 })).toBe(130);
  });

  it("keeps a value that is off the step's grid instead of rounding it away", () => {
    expect(stepValue(12.5, 1, { step: 5 })).toBe(17.5);
    expect(stepValue(137.5, -1, { step: 5 })).toBe(132.5);
    expect(stepValue(0.1 + 0.2, 1, { step: 1 })).toBe(1.3);
  });

  it("starts from the minimum when empty and respects bounds", () => {
    expect(stepValue(null, 1, { step: 1, min: 5 })).toBe(6);
    expect(stepValue(0, -1, { step: 1, min: 0 })).toBe(0);
    expect(stepValue(10, 1, { step: 1, max: 10 })).toBe(10);
  });
});

describe("parseNumber", () => {
  it("reads decimals including a comma and rejects junk", () => {
    expect(parseNumber("12.5")).toBe(12.5);
    expect(parseNumber(" 12,5 ")).toBe(12.5);
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber("-")).toBeNull();
  });
});

describe("formatNumber and helpers", () => {
  it("shows whole numbers without a trailing .0", () => {
    expect(formatNumber(135, 5)).toBe("135");
    expect(formatNumber(132.5, 2.5)).toBe("132.5");
    expect(formatNumber(10, 0.25)).toBe("10");
  });

  it("shows the value that will be saved even when it is finer than the step", () => {
    expect(formatNumber(12.5, 5)).toBe("12.5");
    expect(formatNumber(137.5, 5)).toBe("137.5");
    expect(formatNumber(0.1 + 0.2, 1)).toBe("0.3");
  });

  it("measures step precision and clamps", () => {
    expect(decimalsOf(2.5)).toBe(1);
    expect(decimalsOf(5)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
    expect(clamp(-1, 0, 10)).toBe(0);
  });
});
