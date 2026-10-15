import fs from "node:fs";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exerciseId } from "./fixtures";
import { MIGRATIONS_DIR, asAdmin, createDb, migrationFiles, type Row } from "./harness";

let db: PGlite;
let lib: Row[];

beforeAll(async () => {
  db = await createDb();
  lib = await asAdmin(db, (s) => s.rows("select * from public.exercises where user_id is null order by slug"));
});

afterAll(async () => {
  await db.close();
});

describe("migrations", () => {
  it("are ordered, uniquely named and stamped 20261015", () => {
    const files = migrationFiles();
    expect(files.length).toBeGreaterThanOrEqual(6);
    expect(new Set(files.map((f) => f.slice(0, 14))).size).toBe(files.length);
    for (const f of files) expect(f.startsWith("20261015")).toBe(true);
  });
});

describe("exercise library", () => {
  it("has about seventy-plus global exercises with stable, readable slugs", () => {
    expect(lib.length).toBeGreaterThanOrEqual(70);
    const slugs = lib.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("derives every id from its slug, so ids are the same in every environment", () => {
    for (const e of lib) expect(e.id, e.slug).toBe(exerciseId(e.slug));
  });

  it("keeps rep ranges and increments sensible", () => {
    for (const e of lib) {
      expect(e.default_rep_min, e.slug).toBeLessThanOrEqual(e.default_rep_max);
      if (e.default_increment !== null) expect(Number(e.default_increment), e.slug).toBeGreaterThan(0);
      if (e.load_type === "bodyweight") expect(e.default_increment, e.slug).toBeNull();
      if (e.load_type === "external" && !e.equipment.includes("bands")) {
        expect(e.default_increment, `${e.slug} needs an increment`).not.toBeNull();
      }
    }
  });

  it("builds every ladder with consecutive levels starting at 1", () => {
    const groups = new Map<string, number[]>();
    for (const e of lib) {
      if (!e.progression_group) continue;
      groups.set(e.progression_group, [...(groups.get(e.progression_group) ?? []), e.ladder_level]);
    }
    for (const [group, levels] of groups) {
      expect(levels.sort((a, b) => a - b), group).toEqual(levels.map((_, i) => i + 1));
    }
    const sizes = Object.fromEntries([...groups].map(([g, l]) => [g, l.length]));
    expect(sizes["push-up"]).toBe(9);
    expect(sizes["pull-up"]).toBe(5);
    expect(sizes["bodyweight-leg"]).toBe(5);
    for (const g of ["dip", "inverted-row", "pike-push-up", "glute-bridge", "hamstring-bodyweight", "hanging-core"]) {
      expect(groups.has(g), g).toBe(true);
    }
  });

  it("orders the named push-up, pull-up and leg ladders as the plan describes", () => {
    const order = (group: string) => lib.filter((e) => e.progression_group === group).sort((a, b) => a.ladder_level - b.ladder_level).map((e) => e.slug);
    expect(order("push-up")).toEqual([
      "wall-push-up", "incline-push-up-high", "incline-push-up-low", "push-up", "close-grip-push-up",
      "decline-push-up", "archer-push-up", "pseudo-planche-push-up", "weighted-push-up",
    ]);
    expect(order("pull-up")).toEqual(["negative-pull-up", "band-assisted-pull-up", "chin-up", "pull-up", "weighted-pull-up"]);
    expect(order("bodyweight-leg")).toEqual(["bodyweight-squat", "split-squat", "bulgarian-split-squat", "shrimp-squat", "pistol-squat"]);
  });

  it("covers every movement pattern, with a home and a gym option for the main muscles", () => {
    const patterns = new Set(lib.map((e) => e.movement_pattern));
    for (const p of ["horizontal_push", "vertical_push", "horizontal_pull", "vertical_pull", "squat", "hinge", "lunge", "elbow_flexion", "elbow_extension", "shoulder_isolation", "chest_isolation", "calf", "core"]) {
      expect(patterns.has(p), p).toBe(true);
    }
    for (const muscle of ["chest", "front_delts", "side_delts", "rear_delts", "triceps", "biceps", "lats", "upper_back", "quads", "hamstrings", "glutes", "calves", "abs"]) {
      const options = lib.filter((e) => e.primary_muscle === muscle);
      const home = ["bodyweight", "pullup_bar", "dumbbells", "bands", "bench", "rings", "dip_bars"];
      expect(options.some((e) => e.equipment.every((c: string) => home.includes(c))), `${muscle} home`).toBe(true);
      expect(options.some((e) => e.equipment.some((c: string) => ["barbell", "cable", "machines"].includes(c))), `${muscle} gym`).toBe(true);
    }
  });

  it("can be applied twice without changing anything", async () => {
    const seed = fs.readFileSync(path.join(MIGRATIONS_DIR, migrationFiles().find((f) => f.includes("seed_exercises"))!), "utf8");
    const before = await asAdmin(db, (s) => s.one("select count(*)::int as n, max(server_updated_at) as latest, md5(string_agg(e::text, '|' order by slug)) as h from public.exercises e where user_id is null"));
    await db.exec(seed);
    const after = await asAdmin(db, (s) => s.one("select count(*)::int as n, max(server_updated_at) as latest, md5(string_agg(e::text, '|' order by slug)) as h from public.exercises e where user_id is null"));
    expect(after).toEqual(before);
  });
});
