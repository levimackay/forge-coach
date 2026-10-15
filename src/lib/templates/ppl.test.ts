import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { EquipmentCode, EquipmentProfile, Exercise } from "@/lib/domain/types";
import { A, asAdmin, createDb, firstParty, withRole, type Row, type Session } from "../../../tests/db/harness";
import {
  PPL_TEMPLATES,
  buildPplProgram,
  isExerciseAvailable,
  pplSlugs,
  resolveSlot,
  type PplBuild,
  type PplVariant,
} from "./ppl";

const GYM: EquipmentCode[] = ["bodyweight", "pullup_bar", "dip_bars", "dumbbells", "bands", "barbell", "rack", "bench", "cable", "machines"];
const HOME: EquipmentCode[] = ["bodyweight", "pullup_bar", "dumbbells", "bands", "bench"];
const HOME_NO_BENCH: EquipmentCode[] = ["bodyweight", "pullup_bar", "dumbbells", "bands"];
const NOTHING: EquipmentCode[] = ["bodyweight"];

const NOW = new Date("2026-10-15T12:00:00.000Z");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let db: PGlite;
let library: Exercise[];

const toExercise = (r: Row): Exercise => ({
  id: r.id,
  user_id: r.user_id,
  slug: r.slug,
  name: r.name,
  primary_muscle: r.primary_muscle,
  secondary_muscles: r.secondary_muscles,
  movement_pattern: r.movement_pattern,
  equipment: r.equipment,
  load_type: r.load_type,
  progression_group: r.progression_group,
  ladder_level: r.ladder_level,
  default_rep_min: r.default_rep_min,
  default_rep_max: r.default_rep_max,
  default_increment: r.default_increment === null ? null : Number(r.default_increment),
  notes: r.notes,
  created_at: new Date(r.created_at).toISOString(),
  updated_at: new Date(r.updated_at).toISOString(),
  deleted_at: null,
});

const profile = (equipment: EquipmentCode[], name = "Test"): EquipmentProfile => ({
  id: randomUUID(),
  user_id: A,
  created_at: NOW.toISOString(),
  updated_at: NOW.toISOString(),
  deleted_at: null,
  name,
  equipment,
  dumbbell_increment: 5,
  dumbbell_max: 50,
  barbell_increment: 5,
  is_default: true,
});

const build = (variant: PplVariant, equipment: EquipmentCode[], extra: Partial<Parameters<typeof buildPplProgram>[0]> = {}) =>
  buildPplProgram({ variant, userId: A, equipment: profile(equipment), library, now: NOW, ...extra });

const bySlug = (slug: string) => library.find((e) => e.slug === slug && e.user_id === null)!;
const slugOf = (id: string) => library.find((e) => e.id === id)!.slug;
const slugsOnDay = (b: PplBuild, dayName: string) => {
  const day = b.days.find((d) => d.name === dayName)!;
  return b.planned.filter((p) => p.program_day_id === day.id).map((p) => slugOf(p.exercise_id));
};

beforeAll(async () => {
  db = await createDb();
  const rows = await asAdmin(db, (s) => s.rows("select * from public.exercises where user_id is null order by slug"));
  library = rows.map(toExercise);
});

afterAll(async () => {
  await db.close();
});

describe("template content", () => {
  it.each(["3day", "6day"] as const)("%s refers only to exercises that exist in the seeded library", (variant) => {
    const known = new Set(library.map((e) => e.slug));
    for (const slug of pplSlugs(variant)) expect(known.has(slug), slug).toBe(true);
  });

  it("has three days for the 3 day variant and A and B days for the 6 day variant", () => {
    expect(PPL_TEMPLATES["3day"].days.map((d) => d.name)).toEqual(["Push", "Pull", "Legs"]);
    expect(PPL_TEMPLATES["6day"].days.map((d) => d.name)).toEqual(["Push A", "Pull A", "Legs A", "Push B", "Pull B", "Legs B"]);
    expect(PPL_TEMPLATES["6day"].days.map((d) => d.focus)).toEqual(["push", "pull", "legs", "push", "pull", "legs"]);
  });

  it("gives every slot sane numbers and a gym and a home option", () => {
    for (const variant of ["3day", "6day"] as const) {
      for (const day of PPL_TEMPLATES[variant].days) {
        expect(day.slots.length).toBeGreaterThanOrEqual(5);
        for (const s of day.slots) {
          expect(s.gym).toBeTruthy();
          expect(s.home).toBeTruthy();
          expect(s.sets).toBeGreaterThanOrEqual(1);
          expect(s.sets).toBeLessThanOrEqual(20);
          expect(s.repMin).toBeLessThanOrEqual(s.repMax);
          expect(s.targetRir).toBeGreaterThanOrEqual(0);
          expect(s.targetRir).toBeLessThanOrEqual(10);
        }
      }
    }
  });

  it("never repeats the same exercise on a day for a full gym", () => {
    for (const variant of ["3day", "6day"] as const) {
      const b = build(variant, GYM);
      for (const d of b.days) {
        const ids = b.planned.filter((p) => p.program_day_id === d.id).map((p) => p.exercise_id);
        expect(new Set(ids).size, d.name).toBe(ids.length);
      }
    }
  });
});

describe("isExerciseAvailable", () => {
  it("treats bodyweight as always owned and needs every other listed code", () => {
    expect(isExerciseAvailable({ equipment: ["bodyweight"] }, [])).toBe(true);
    expect(isExerciseAvailable({ equipment: ["dumbbells", "bench"] }, ["dumbbells"])).toBe(false);
    expect(isExerciseAvailable({ equipment: ["dumbbells", "bench"] }, ["bench", "dumbbells", "bands"])).toBe(true);
    expect(isExerciseAvailable({ equipment: ["pullup_bar", "bands"] }, ["pullup_bar"])).toBe(false);
  });
});

describe("resolveSlot", () => {
  it("prefers the gym option, then the home option", () => {
    const slot = { gym: "barbell-bench-press", home: "push-up" };
    expect(resolveSlot(slot, library, GYM)).toMatchObject({ source: "gym", exercise: { slug: "barbell-bench-press" } });
    expect(resolveSlot(slot, library, HOME)).toMatchObject({ source: "home", exercise: { slug: "push-up" } });
  });

  it("uses the gym option at home when the equipment happens to allow it", () => {
    expect(resolveSlot({ gym: "dumbbell-bench-press", home: "push-up" }, library, HOME)).toMatchObject({
      source: "gym",
      exercise: { slug: "dumbbell-bench-press" },
    });
  });

  it("falls back to the same movement and muscle", () => {
    // No pull-up bar, only bands: the band pulldown is the other vertical pull for the lats.
    expect(resolveSlot({ gym: "chin-up", home: "chin-up" }, library, ["bodyweight", "bands"])).toMatchObject({
      source: "substitute",
      exercise: { slug: "band-pulldown" },
    });
    // The rows that are left at home are not on a ladder, so the first by slug wins.
    expect(resolveSlot({ gym: "barbell-row", home: "inverted-row" }, library, HOME)).toMatchObject({
      source: "substitute",
      exercise: { slug: "band-row" },
    });
  });

  it("prefers the nearest rung of the same ladder over unrelated exercises", () => {
    const slot = { gym: "pull-up", home: "pull-up" };
    const owned: EquipmentCode[] = ["bodyweight", "pullup_bar", "bands"];
    const used = new Set([bySlug("pull-up").id]);
    // chin-up and weighted-pull-up are both one rung from the pull-up; the tie goes to the earlier slug.
    expect(resolveSlot(slot, library, owned, used)).toMatchObject({ exercise: { slug: "chin-up" } });
    used.add(bySlug("chin-up").id);
    expect(resolveSlot(slot, library, owned, used)).toMatchObject({ exercise: { slug: "weighted-pull-up" } });
  });

  it("skips exercises already used and returns null when nothing fits", () => {
    const used = new Set([bySlug("dumbbell-curl").id]);
    expect(resolveSlot({ gym: "barbell-curl", home: "dumbbell-curl" }, library, HOME_NO_BENCH, used)).toMatchObject({
      source: "substitute",
      exercise: { slug: "hammer-curl" },
    });
    expect(resolveSlot({ gym: "lat-pulldown", home: "pull-up" }, library, NOTHING)).toBeNull();
    expect(resolveSlot({ gym: "not-a-slug", home: "also-not" }, library, GYM)).toBeNull();
  });

  it("ignores deleted exercises", () => {
    const trimmed = library.map((e) => (e.slug === "barbell-bench-press" ? { ...e, deleted_at: NOW.toISOString() } : e));
    expect(resolveSlot({ gym: "barbell-bench-press", home: "push-up" }, trimmed, GYM)).toMatchObject({ exercise: { slug: "push-up" } });
  });
});

describe("buildPplProgram with a full gym", () => {
  it.each(["3day", "6day"] as const)("%s uses the gym exercise in every slot with no warnings", (variant) => {
    const b = build(variant, GYM);
    expect(b.warnings).toEqual([]);
    const expected = PPL_TEMPLATES[variant].days.map((d) => d.slots.map((s) => s.gym));
    const actual = b.days.map((d) => b.planned.filter((p) => p.program_day_id === d.id).map((p) => slugOf(p.exercise_id)));
    expect(actual).toEqual(expected);
  });

  it("builds the program, day and exercise rows with the right shape", () => {
    const eq = profile(GYM, "Commercial gym");
    const b = buildPplProgram({ variant: "6day", userId: A, equipment: eq, library, now: NOW });
    expect(b.program).toMatchObject({
      user_id: A,
      name: "Push / Pull / Legs (6 day)",
      split: "ppl",
      days_per_week: 6,
      is_active: true,
      version: 1,
      deleted_at: null,
      created_at: NOW.toISOString(),
      updated_at: NOW.toISOString(),
    });
    expect(b.days).toHaveLength(6);
    expect(b.days.map((d) => d.position)).toEqual([0, 1, 2, 3, 4, 5]);
    for (const d of b.days) {
      expect(d).toMatchObject({ program_id: b.program.id, user_id: A, equipment_profile_id: eq.id, deleted_at: null });
      const rows = b.planned.filter((p) => p.program_day_id === d.id);
      expect(rows.map((r) => r.position)).toEqual(rows.map((_, i) => i));
    }
    for (const p of b.planned) {
      expect(p).toMatchObject({ user_id: A, load: null, is_active: true, notes: null, deleted_at: null });
      expect(p.rep_min).toBeLessThanOrEqual(p.rep_max);
      expect(p.sets).toBeGreaterThanOrEqual(1);
      expect(p.rest_seconds).toBeGreaterThan(0);
    }
    const ids = [b.program.id, ...b.days.map((d) => d.id), ...b.planned.map((p) => p.id)];
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(UUID);
  });

  it("uses the slot rep range for loaded lifts and the exercise's own range for bodyweight work", () => {
    const gym = build("6day", GYM);
    const bench = gym.planned.find((p) => slugOf(p.exercise_id) === "barbell-bench-press")!;
    expect([bench.sets, bench.rep_min, bench.rep_max, bench.target_rir, bench.rest_seconds]).toEqual([3, 6, 10, 2, 120]);
    const raise = gym.planned.find((p) => slugOf(p.exercise_id) === "cable-lateral-raise")!;
    expect([raise.rep_min, raise.rep_max, raise.target_rir, raise.rest_seconds]).toEqual([12, 20, 1, 75]);

    const home = build("6day", HOME);
    const pushUp = home.planned.find((p) => slugOf(p.exercise_id) === "push-up")!;
    expect([pushUp.rep_min, pushUp.rep_max]).toEqual([bySlug("push-up").default_rep_min, bySlug("push-up").default_rep_max]);
    const deadlift = gym.planned.find((p) => slugOf(p.exercise_id) === "deadlift")!;
    expect([deadlift.rep_min, deadlift.rep_max]).toEqual([5, 8]);
  });

  it("gives the 3 day variant an extra set on the first two lifts and one more exercise a day", () => {
    const three = build("3day", GYM);
    const six = build("6day", GYM);
    const first = (b: PplBuild, name: string) => b.planned.filter((p) => p.program_day_id === b.days.find((d) => d.name === name)!.id);
    expect(first(three, "Push").map((p) => p.sets).slice(0, 3)).toEqual([4, 4, 3]);
    expect(first(six, "Push A").map((p) => p.sets).slice(0, 3)).toEqual([3, 3, 3]);
    expect(first(three, "Push")).toHaveLength(first(six, "Push A").length + 1);
    expect(three.program.days_per_week).toBe(3);
    expect(three.program.notes).toMatch(/once a week/);
    expect(six.program.notes).toMatch(/twice a week/);
  });
});

describe("buildPplProgram at home", () => {
  it("uses home options where the gym option needs missing equipment and warns about the one gap", () => {
    const b = build("6day", HOME);
    expect(slugsOnDay(b, "Push A")).toEqual([
      "push-up", "seated-dumbbell-shoulder-press", "incline-dumbbell-press", "dumbbell-lateral-raise", "dumbbell-overhead-triceps-extension",
    ]);
    expect(slugsOnDay(b, "Pull A")).toEqual(["pull-up", "band-row", "one-arm-dumbbell-row", "band-face-pull", "dumbbell-curl"]);
    expect(slugsOnDay(b, "Legs A")).toEqual([
      "bulgarian-split-squat", "dumbbell-romanian-deadlift", "split-squat", "slider-leg-curl", "single-leg-calf-raise", "hanging-knee-raise",
    ]);
    expect(b.warnings).toHaveLength(1);
    expect(b.warnings[0]).toMatchObject({ day: "Pull A", slot: 1 });
    expect(b.warnings[0].message).toContain("Band row");
  });

  it("only ever picks exercises the equipment allows, whatever the profile", () => {
    for (const equipment of [GYM, HOME, HOME_NO_BENCH, NOTHING, ["bodyweight", "rings", "dip_bars"] as EquipmentCode[]]) {
      for (const variant of ["3day", "6day"] as const) {
        const b = build(variant, equipment);
        for (const p of b.planned) {
          expect(isExerciseAvailable(library.find((e) => e.id === p.exercise_id)!, equipment), `${variant} ${slugOf(p.exercise_id)}`).toBe(true);
        }
        for (const d of b.days) {
          const ids = b.planned.filter((p) => p.program_day_id === d.id).map((p) => p.exercise_id);
          expect(new Set(ids).size).toBe(ids.length);
        }
      }
    }
  });

  it("does not repeat an exercise when two slots share a home option", () => {
    const b = build("3day", HOME_NO_BENCH);
    const pull = slugsOnDay(b, "Pull");
    expect(new Set(pull).size).toBe(pull.length);
    expect(pull).toContain("hammer-curl");
  });

  it("reports slots it cannot fill and days left empty", () => {
    const b = build("6day", NOTHING);
    expect(slugsOnDay(b, "Pull A")).toEqual([]);
    expect(b.warnings.some((w) => w.day === "Pull A" && w.slot === -1)).toBe(true);
    expect(b.warnings.some((w) => w.message.startsWith("Skipped"))).toBe(true);
    expect(slugsOnDay(b, "Push A")).toEqual(["push-up", "pike-push-up", "decline-push-up"]);
  });

  it("can build an inactive program", () => {
    expect(build("3day", GYM, { isActive: false }).program.is_active).toBe(false);
  });

  it("does not change its inputs and is repeatable apart from ids", () => {
    const frozen = Object.freeze(library.map((e) => Object.freeze({ ...e })));
    const eq = Object.freeze(profile(HOME));
    const strip = (b: PplBuild) => ({
      days: b.days.map(({ id: _i, program_id: _p, ...rest }) => rest),
      planned: b.planned.map(({ id: _i, program_day_id: _d, ...rest }) => rest),
      warnings: b.warnings,
    });
    const one = buildPplProgram({ variant: "6day", userId: A, equipment: eq, library: frozen, now: NOW });
    const two = buildPplProgram({ variant: "6day", userId: A, equipment: eq, library: frozen, now: NOW });
    expect(strip(one)).toEqual(strip(two));
    expect(one.program.id).not.toBe(two.program.id);
  });
});

describe("generated rows are accepted by the database", () => {
  const insert = async (s: Session, table: string, rows: object[]) => {
    for (const row of rows) {
      await s.exec(`insert into public.${table} select * from jsonb_populate_record(null::public.${table}, $1::jsonb)`, [JSON.stringify(row)]);
    }
  };

  it.each([
    ["3day", GYM],
    ["6day", GYM],
    ["3day", HOME],
    ["6day", HOME],
    ["6day", HOME_NO_BENCH],
  ] as const)("%s on %j inserts under row level security", async (variant, equipment) => {
    await withRole(db, "postgres", null, async (s) => {
      await s.exec("insert into auth.users (id, email) values ($1, 'ppl@example.test')", [A]);
      await s.switch("authenticated", firstParty(A));
      const eq = profile([...equipment]);
      const b = buildPplProgram({ variant, userId: A, equipment: eq, library, now: NOW });
      await insert(s, "equipment_profiles", [eq]);
      await insert(s, "programs", [b.program]);
      await insert(s, "program_days", b.days);
      await insert(s, "planned_exercises", b.planned);
      await s.exec("set constraints all immediate");

      const counts = await s.one(
        `select (select count(*)::int from public.program_days where program_id = $1) as days,
                (select count(*)::int from public.planned_exercises where user_id = $2) as planned`,
        [b.program.id, A],
      );
      expect(counts).toEqual({ days: b.days.length, planned: b.planned.length });
    });
  });

  it("a second active program is refused when the transaction ends", async () => {
    await withRole(db, "postgres", null, async (s) => {
      await s.exec("insert into auth.users (id, email) values ($1, 'ppl@example.test')", [A]);
      await s.switch("authenticated", firstParty(A));
      const eq = profile(GYM);
      await insert(s, "equipment_profiles", [eq]);
      await insert(s, "programs", [buildPplProgram({ variant: "3day", userId: A, equipment: eq, library, now: NOW }).program]);
      await insert(s, "programs", [buildPplProgram({ variant: "6day", userId: A, equipment: eq, library, now: NOW }).program]);
      expect((await s.denied("set constraints all immediate")).code).toBe("23P01");
    });
  });
});
