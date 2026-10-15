import { describe, expect, it } from "vitest";
import { deterministicUuid } from "./ids";

describe("deterministicUuid", () => {
  it("is stable and shaped like a v4 UUID", () => {
    const a = deterministicUuid("decision:w1:p1");
    expect(a).toBe(deterministicUuid("decision:w1:p1"));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("separates different seeds", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) seen.add(deterministicUuid(`fixture:${i}`));
    expect(seen.size).toBe(5000);
    expect(deterministicUuid("a")).not.toBe(deterministicUuid("b"));
  });
});
