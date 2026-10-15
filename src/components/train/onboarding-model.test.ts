import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Exercise } from "@/lib/domain/types";
import { getDb } from "@/lib/local/db";
import { freshLocalState, TEST_USER } from "@/lib/local/test-support";
import { GYM_EQUIPMENT, buildEquipmentInputs, emptyDraft, mainPlace, previewProgram, saveOnboarding, validateStep, type OnboardingDraft } from "./onboarding-model";
import { seededLibrary } from "./test-library";

vi.mock("@/lib/supabase/client", async () => {
  const { fakeServer } = await import("@/lib/local/test-support");
  return { getSupabase: () => fakeServer.client };
});

let library: Exercise[];
beforeAll(async () => {
  library = await seededLibrary();
});

const draft = (over: Partial<OnboardingDraft> = {}): OnboardingDraft => ({
  ...emptyDraft(null),
  name: "Levi",
  bodyweight: 180,
  ...over,
});

describe("validateStep", () => {
  it("asks for a name and a plausible bodyweight", () => {
    expect(validateStep(0, draft())).toEqual({});
    expect(validateStep(0, draft({ name: "  " })).name).toBeTruthy();
    expect(validateStep(0, draft({ bodyweight: null })).bodyweight).toBeTruthy();
    expect(validateStep(0, draft({ bodyweight: 12 })).bodyweight).toMatch(/50 and 700 lb/);
    expect(validateStep(0, draft({ unit: "kg", bodyweight: 80 }))).toEqual({});
    expect(validateStep(0, draft({ unit: "kg", bodyweight: 800 })).bodyweight).toMatch(/kg/);
  });

  it("needs a place to train and sane dumbbell numbers", () => {
    expect(validateStep(1, draft({ atHome: false, atGym: false })).places).toBeTruthy();
    expect(validateStep(1, draft({ atHome: false, atGym: true }))).toEqual({});
    const withDumbbells = draft({ homeEquipment: ["dumbbells"] });
    expect(validateStep(1, withDumbbells)).toEqual({});
    expect(validateStep(1, { ...withDumbbells, dumbbellIncrement: 0 }).dumbbell_increment).toBeTruthy();
    expect(validateStep(1, { ...withDumbbells, dumbbellIncrement: 10, dumbbellMax: 5 }).dumbbell_max).toBeTruthy();
  });

  it("ignores dumbbell numbers when there are no dumbbells", () => {
    expect(validateStep(1, draft({ dumbbellIncrement: 0 }))).toEqual({});
  });
});

describe("equipment inputs", () => {
  it("builds Home with bodyweight, chosen gear and the dumbbell numbers", () => {
    const [home] = buildEquipmentInputs(draft({ homeEquipment: ["bands", "dumbbells", "pullup_bar"], dumbbellIncrement: 2.5, dumbbellMax: 40 }));
    expect(home.name).toBe("Home");
    expect(home.equipment).toEqual(["bodyweight", "pullup_bar", "dumbbells", "bands"]);
    expect(home.dumbbell_increment).toBe(2.5);
    expect(home.dumbbell_max).toBe(40);
    expect(home.is_default).toBe(true);
  });

  it("uses the unit default for dumbbells and drops the numbers without dumbbells", () => {
    const [kg] = buildEquipmentInputs(draft({ unit: "kg", homeEquipment: ["dumbbells"] }));
    expect(kg.dumbbell_increment).toBe(2.5);
    expect(kg.dumbbell_max).toBe(25);
    const [bare] = buildEquipmentInputs(draft({ homeEquipment: ["bands"] }));
    expect(bare.dumbbell_increment).toBeNull();
    expect(bare.dumbbell_max).toBeNull();
  });

  it("makes the main place the default when training in both", () => {
    const both = draft({ atGym: true, main: "gym" });
    const [home, gym] = buildEquipmentInputs(both);
    expect(home.is_default).toBe(false);
    expect(gym.name).toBe("Gym");
    expect(gym.equipment).toEqual(GYM_EQUIPMENT);
    expect(gym.is_default).toBe(true);
  });

  it("falls back to the only place that is on", () => {
    expect(mainPlace(draft({ atHome: false, atGym: true, main: "home" }))).toBe("gym");
    const inputs = buildEquipmentInputs(draft({ atHome: false, atGym: true, main: "home" }));
    expect(inputs).toHaveLength(1);
    expect(inputs[0].is_default).toBe(true);
  });
});

describe("previewProgram", () => {
  it("lists the days for the chosen length", () => {
    expect(previewProgram("3day", GYM_EQUIPMENT, library).days.map((d) => d.name)).toEqual(["Push", "Pull", "Legs"]);
    expect(previewProgram("6day", GYM_EQUIPMENT, library).days).toHaveLength(6);
  });

  it("fills every slot at a gym and flags substitutes at home", () => {
    const gym = previewProgram("3day", GYM_EQUIPMENT, library);
    expect(gym.skipped).toBe(0);
    expect(gym.days.every((d) => d.exercises.length >= 5)).toBe(true);
    const bareHome = previewProgram("3day", ["bodyweight"], library);
    expect(bareHome.days.flatMap((d) => d.exercises).length).toBeGreaterThan(0);
  });
});

describe("saveOnboarding", () => {
  beforeEach(async () => {
    await freshLocalState();
    await getDb().exercises.bulkPut(library);
  });

  it("writes the profile, equipment, goal and program in one go", async () => {
    const now = new Date("2026-10-15T15:00:00.000Z");
    await saveOnboarding(
      draft({
        atGym: true,
        main: "gym",
        homeEquipment: ["pullup_bar", "dumbbells"],
        goalKind: "strength",
        goalNote: "  Bench 225  ",
        focus: ["chest", "lats"],
        variant: "6day",
      }),
      library,
      now,
    );

    const db = getDb();
    const profile = await db.profiles.get(TEST_USER);
    expect(profile).toMatchObject({ display_name: "Levi", unit: "lb", bodyweight: 180, onboarded_at: now.toISOString() });
    expect(profile?.timezone.length).toBeGreaterThan(0);

    const equipment = await db.equipment_profiles.toArray();
    expect(equipment.map((e) => e.name).sort()).toEqual(["Gym", "Home"]);
    const gym = equipment.find((e) => e.name === "Gym");

    const goals = await db.goals.toArray();
    expect(goals).toHaveLength(1);
    expect(goals[0]).toMatchObject({ kind: "strength", description: "Bench 225", focus_muscles: ["chest", "lats"], active: true });

    const programs = await db.programs.toArray();
    expect(programs).toHaveLength(1);
    expect(programs[0]).toMatchObject({ split: "ppl", days_per_week: 6, is_active: true });
    const days = await db.program_days.toArray();
    expect(days).toHaveLength(6);
    expect(days.every((d) => d.equipment_profile_id === gym?.id)).toBe(true);
    expect((await db.planned_exercises.toArray()).length).toBeGreaterThanOrEqual(30);

    const queued = (await db.outbox.toArray()).map((e) => e.table);
    for (const table of ["profiles", "equipment_profiles", "goals", "programs", "program_days", "planned_exercises"]) {
      expect(queued).toContain(table);
    }
  });

  it("uses a plain label as the goal description when none is typed", async () => {
    await saveOnboarding(draft({ goalKind: "hypertrophy" }), library);
    expect((await getDb().goals.toArray())[0].description).toBe("Build muscle");
  });

  it("saves nothing when no exercise fits", async () => {
    await getDb().exercises.clear();
    await expect(saveOnboarding(draft(), [])).rejects.toThrow(/No exercises/);
    const db = getDb();
    expect(await db.profiles.count()).toBe(0);
    expect(await db.equipment_profiles.count()).toBe(0);
    expect(await db.programs.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });
});
