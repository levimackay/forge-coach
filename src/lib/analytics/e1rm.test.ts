import { describe, expect, it } from "vitest";
import { effectiveLoad, epley1RM, setE1rm } from "./e1rm";

describe("epley1RM", () => {
  it("100 x 5 = 100 * (1 + 5/30)", () => {
    expect(epley1RM(100, 5)).toBeCloseTo(116.6667, 4);
  });

  it("a single returns the load itself", () => {
    expect(epley1RM(225, 1)).toBe(225);
  });

  it("caps reps at 12: 100 x 15 equals 100 x 12 = 140", () => {
    expect(epley1RM(100, 12)).toBeCloseTo(140, 6);
    expect(epley1RM(100, 15)).toBeCloseTo(140, 6);
  });

  it("returns null for unusable input", () => {
    expect(epley1RM(0, 5)).toBeNull();
    expect(epley1RM(-10, 5)).toBeNull();
    expect(epley1RM(100, 0)).toBeNull();
    expect(epley1RM(Number.NaN, 5)).toBeNull();
  });
});

describe("effectiveLoad", () => {
  it("external uses the bar load and ignores bodyweight", () => {
    expect(effectiveLoad({ load_type: "external" }, 135, 180)).toBe(135);
    expect(effectiveLoad({ load_type: "external" }, null, 180)).toBeNull();
    expect(effectiveLoad({ load_type: "external" }, 0, 180)).toBeNull();
  });

  it("bodyweight adds added load to bodyweight", () => {
    expect(effectiveLoad({ load_type: "bodyweight" }, null, 180)).toBe(180);
    expect(effectiveLoad({ load_type: "bodyweight" }, 25, 180)).toBe(205);
  });

  it("bodyweight is unknown without a bodyweight", () => {
    expect(effectiveLoad({ load_type: "bodyweight" }, 25, null)).toBeNull();
    expect(effectiveLoad({ load_type: "bodyweight" }, null, 0)).toBeNull();
  });

  it("assisted subtracts the assistance from bodyweight", () => {
    expect(effectiveLoad({ load_type: "assisted" }, 40, 180)).toBe(140);
    expect(effectiveLoad({ load_type: "assisted" }, null, 180)).toBe(180);
    expect(effectiveLoad({ load_type: "assisted" }, 40, null)).toBeNull();
    expect(effectiveLoad({ load_type: "assisted" }, 200, 180)).toBeNull();
  });
});

describe("setE1rm", () => {
  it("pull-up with 25 added at bodyweight 180, 5 reps: 205 * (1 + 5/30)", () => {
    expect(setE1rm({ reps: 5, load: 25 }, { load_type: "bodyweight" }, 180)).toBeCloseTo(239.1667, 4);
  });

  it("is null for a bodyweight set when bodyweight is unknown", () => {
    expect(setE1rm({ reps: 10, load: null }, { load_type: "bodyweight" }, null)).toBeNull();
  });
});
