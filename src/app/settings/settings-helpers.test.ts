import { describe, expect, it } from "vitest";
import type { EquipmentProfile, Goal } from "@/lib/domain/types";
import pkg from "../../../package.json";
import { blankGoal, draftFromGoal, goalSubtitle, parseGoal } from "./goal-form";
import { draftFromProfile, parseDraft, parseOptionalNumber, type EquipmentDraft } from "./equipment-form";
import { previewImport } from "./import-preview";
import { APP_VERSION } from "./version";

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TS = "2026-10-01T00:00:00.000Z";
const USER = ID(1);

describe("version", () => {
  it("matches package.json", () => {
    expect(APP_VERSION).toBe(pkg.version);
  });
});

describe("parseOptionalNumber", () => {
  it("treats blank as not set and accepts a decimal comma", () => {
    expect(parseOptionalNumber("")).toEqual({ ok: true, value: null });
    expect(parseOptionalNumber("  ")).toEqual({ ok: true, value: null });
    expect(parseOptionalNumber("2,5")).toEqual({ ok: true, value: 2.5 });
    expect(parseOptionalNumber("5")).toEqual({ ok: true, value: 5 });
  });

  it("rejects text, negatives, zero and absurd values", () => {
    for (const bad of ["abc", "-5", "0", "1e3", "5 lb", "1001"]) expect(parseOptionalNumber(bad).ok).toBe(false);
  });
});

describe("equipment draft", () => {
  const draft = (over: Partial<EquipmentDraft> = {}): EquipmentDraft => ({
    name: "Home",
    equipment: ["bodyweight", "dumbbells"],
    dumbbellIncrement: "5",
    dumbbellMax: "50",
    barbellIncrement: "",
    isDefault: true,
    ...over,
  });

  it("turns a valid draft into row fields and keeps bodyweight on the list", () => {
    const r = parseDraft(draft({ equipment: ["dumbbells", "bench"], name: "  Home  " }));
    expect(r).toEqual({
      ok: true,
      value: {
        name: "Home",
        equipment: ["bodyweight", "dumbbells", "bench"],
        dumbbell_increment: 5,
        dumbbell_max: 50,
        barbell_increment: null,
        is_default: true,
      },
    });
  });

  it("drops step sizes for kit that is not listed", () => {
    const r = parseDraft(draft({ equipment: ["bodyweight", "bands"], dumbbellIncrement: "5", barbellIncrement: "5" }));
    expect(r.ok && r.value.dumbbell_increment).toBeNull();
    expect(r.ok && r.value.barbell_increment).toBeNull();
  });

  it("reports each problem against its field", () => {
    const r = parseDraft(draft({ name: " ", dumbbellIncrement: "abc", dumbbellMax: "-1" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.errors).sort()).toEqual(["dumbbellIncrement", "dumbbellMax", "name"]);
    }
  });

  it("rejects a maximum below the step size", () => {
    const r = parseDraft(draft({ dumbbellIncrement: "10", dumbbellMax: "5" }));
    expect(r.ok).toBe(false);
  });

  it("makes the first profile the default", () => {
    expect(draftFromProfile(null, true).isDefault).toBe(true);
    expect(draftFromProfile(null, false).isDefault).toBe(false);
  });

  it("round trips an existing profile", () => {
    const profile: EquipmentProfile = {
      id: ID(2),
      user_id: USER,
      created_at: TS,
      updated_at: TS,
      deleted_at: null,
      name: "Garage",
      equipment: ["bodyweight", "barbell", "rack"],
      dumbbell_increment: null,
      dumbbell_max: null,
      barbell_increment: 5,
      is_default: false,
    };
    const r = parseDraft(draftFromProfile(profile, false));
    expect(r.ok && r.value).toMatchObject({ name: "Garage", barbell_increment: 5, is_default: false });
  });
});

describe("goal draft", () => {
  it("requires a description and a real date", () => {
    expect(parseGoal(blankGoal()).ok).toBe(false);
    const bad = parseGoal({ ...blankGoal(), description: "Bigger back", targetDate: "2026-13-45" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.targetDate).toBeDefined();
  });

  it("builds a row from a valid draft", () => {
    const r = parseGoal({ kind: "strength", description: "  Bench 225  ", focusMuscles: ["chest"], targetDate: "2027-01-01", active: true });
    expect(r).toEqual({
      ok: true,
      value: { kind: "strength", description: "Bench 225", focus_muscles: ["chest"], target_date: "2027-01-01", active: true },
    });
    expect(parseGoal({ ...blankGoal(), description: "x" })).toMatchObject({ ok: true, value: { target_date: null } });
  });

  it("describes a goal in one line", () => {
    const goal: Goal = {
      id: ID(3),
      user_id: USER,
      created_at: TS,
      updated_at: TS,
      deleted_at: null,
      kind: "hypertrophy",
      description: "Bigger back",
      focus_muscles: ["lats", "upper_back"],
      target_date: "2027-03-01",
      active: false,
    };
    expect(goalSubtitle(goal)).toBe("Build muscle, Lats, Upper back, by 2027-03-01, paused");
    expect(draftFromGoal(goal).focusMuscles).toEqual(["lats", "upper_back"]);
  });
});

describe("previewImport", () => {
  const exportFile = (over: Record<string, unknown> = {}, tables: Record<string, unknown[]> = {}) => ({
    format: "forge-coach-export",
    version: 1,
    exported_at: TS,
    user_id: USER,
    tables: {
      goals: [
        {
          id: ID(10),
          user_id: USER,
          created_at: TS,
          updated_at: TS,
          deleted_at: null,
          kind: "hypertrophy",
          description: "Bigger back",
          focus_muscles: [],
          target_date: null,
          active: true,
        },
      ],
      ...tables,
    },
    ...over,
  });

  it("counts rows per table for a valid file", () => {
    const r = previewImport(exportFile(), USER);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.preview.total).toBe(1);
      expect(r.preview.rows).toEqual([{ table: "goals", label: "Goals", count: 1 }]);
      expect(r.preview.otherAccount).toBe(false);
      expect(r.preview.skipped).toBe(0);
    }
  });

  it("does not count the soft-deleted rows an export carries for references", () => {
    const file = exportFile();
    const goals = file.tables.goals as Record<string, unknown>[];
    goals.push({ ...goals[0], id: ID(11), deleted_at: TS });
    const r = previewImport(file, USER);
    expect(r.ok && r.preview.rows).toEqual([{ table: "goals", label: "Goals", count: 1 }]);
  });

  it("flags a file from another account", () => {
    const r = previewImport(exportFile({ user_id: ID(99) }), USER);
    expect(r.ok && r.preview.otherAccount).toBe(true);
  });

  it("skips server owned tables and library exercises", () => {
    const r = previewImport(
      exportFile(
        {},
        {
          audit_log: [{ id: ID(20), user_id: USER, at: TS, actor: "user", client_id: null, action: "x", entity: "y", entity_id: null, details: {} }],
          exercises: [
            {
              id: ID(30),
              user_id: null,
              slug: "bench",
              name: "Bench",
              primary_muscle: "chest",
              secondary_muscles: [],
              movement_pattern: "horizontal_push",
              equipment: ["barbell"],
              load_type: "external",
              progression_group: null,
              ladder_level: null,
              default_rep_min: 6,
              default_rep_max: 10,
              default_increment: null,
              notes: null,
              created_at: TS,
              updated_at: TS,
              deleted_at: null,
            },
          ],
        },
      ),
      USER,
    );
    expect(r.ok && r.preview.skipped).toBe(2);
    expect(r.ok && r.preview.total).toBe(1);
  });

  it("explains what is wrong with a bad file", () => {
    for (const bad of [null, "text", { format: "other" }, exportFile({ version: 2 }), exportFile({}, { goals: [{ id: "nope" }] })]) {
      const r = previewImport(bad, USER);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/not a valid FORGE export/);
    }
  });
});
