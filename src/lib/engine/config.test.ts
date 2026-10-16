import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ENGINE_CONFIG, ENGINE_VERSION } from "./config";

const lines = readFileSync(join(__dirname, "config.ts"), "utf8").split("\n");
const body = lines.slice(lines.findIndex((l) => l.startsWith("export const ENGINE_CONFIG")));

describe("ENGINE_CONFIG", () => {
  it("has a semantic version", () => {
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("gives every sourced constant a citation URL", () => {
    const sourced = body.filter((l) => l.includes("SOURCED"));
    expect(sourced.length).toBeGreaterThan(3);
    for (const line of sourced) expect(line).toMatch(/https?:\/\//);
  });

  it("tags every constant SOURCED or HEURISTIC", () => {
    const keyLine = /^( {2}| {4})([A-Za-z]\w*):/;
    const tagged = (text: string) => /SOURCED|HEURISTIC/.test(text);
    let parentTagged = false;
    const untagged: string[] = [];
    body.forEach((line, i) => {
      const m = keyLine.exec(line);
      if (!m) return;
      const comment: string[] = [];
      for (let j = i - 1; j >= 0 && body[j].trim().startsWith("//"); j--) comment.push(body[j]);
      const own = tagged(comment.join(" ")) || tagged(line);
      const container = line.trimEnd().endsWith("{");
      if (m[1].length === 2) {
        parentTagged = own;
        if (!container && !own) untagged.push(m[2]);
      } else if (!own && !parentTagged) {
        untagged.push(m[2]);
      }
    });
    expect(untagged).toEqual([]);
  });

  it("keeps the gap tiers in ascending order and ends open", () => {
    const days = ENGINE_CONFIG.gap.cuts.map((c) => c.maxDays);
    expect([...days].sort((a, b) => a - b)).toEqual(days);
    expect(days[days.length - 1]).toBe(Number.POSITIVE_INFINITY);
    expect(ENGINE_CONFIG.gap.normalMaxDays).toBeLessThan(ENGINE_CONFIG.gap.repeatMaxDays);
    expect(ENGINE_CONFIG.gap.repeatMaxDays).toBeLessThan(days[0]);
  });

  it("uses sane magnitudes", () => {
    expect(ENGINE_CONFIG.maxJumpPct).toBe(10);
    expect(ENGINE_CONFIG.repCap).toBe(30);
    expect(ENGINE_CONFIG.deloadPct).toBeGreaterThan(0);
    expect(ENGINE_CONFIG.deloadPct).toBeLessThan(0.5);
    expect(ENGINE_CONFIG.stallSessions).toBeGreaterThanOrEqual(2);
    for (const unit of ["lb", "kg"] as const) {
      for (const step of Object.values(ENGINE_CONFIG.increments[unit])) expect(step).toBeGreaterThan(0);
    }
  });
});
