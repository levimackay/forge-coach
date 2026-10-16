import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Exercise } from "@/lib/domain/types";
import { getDb } from "@/lib/local/db";
import { loadActiveProgram } from "@/lib/local/hooks";
import { freshLocalState } from "@/lib/local/test-support";
import {
  addPlannedExercise,
  clampReps,
  movePlannedExercise,
  reorder,
  savePlannedEdit,
  setPlannedActive,
  swapPlannedExercise,
} from "./program-actions";
import { createPplProgram } from "./program-build";
import { NOW, clock, onboard } from "./test-flow";
import { seededLibrary } from "./test-library";

vi.mock("@/lib/supabase/client", async () => {
  const { fakeServer } = await import("@/lib/local/test-support");
  return { getSupabase: () => fakeServer.client };
});

let library: Exercise[];
beforeAll(async () => {
  library = await seededLibrary();
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  clock(NOW);
  await freshLocalState();
  await getDb().exercises.bulkPut(library);
});

afterEach(() => vi.useRealTimers());

const bySlug = (slug: string) => library.find((e) => e.slug === slug)!;

describe("clampReps", () => {
  const current = { rep_min: 8, rep_max: 12 };

  it("pushes the upper bound up when the lower bound passes it", () => {
    expect(clampReps({ rep_min: 15 }, current)).toEqual({ rep_min: 15, rep_max: 15 });
  });

  it("pulls the lower bound down when the upper bound drops under it", () => {
    expect(clampReps({ rep_max: 6 }, current)).toEqual({ rep_min: 6, rep_max: 6 });
  });

  it("leaves a valid change alone", () => {
    expect(clampReps({ rep_min: 6 }, current)).toEqual({ rep_min: 6, rep_max: 12 });
    expect(clampReps({ rep_max: 15 }, current)).toEqual({ rep_min: 8, rep_max: 15 });
  });
});

describe("reorder", () => {
  const items = [
    { id: "a", position: 0 },
    { id: "b", position: 1 },
    { id: "c", position: 2 },
  ];

  it("moves an item down or up and renumbers only what changed", () => {
    expect(reorder(items, "a", 1)).toEqual([
      { id: "b", position: 0 },
      { id: "a", position: 1 },
    ]);
    expect(reorder(items, "c", -1)).toEqual([
      { id: "c", position: 1 },
      { id: "b", position: 2 },
    ]);
  });

  it("does nothing at either end or for an unknown id", () => {
    expect(reorder(items, "a", -1)).toEqual([]);
    expect(reorder(items, "c", 1)).toEqual([]);
    expect(reorder(items, "zzz", 1)).toEqual([]);
  });

  it("cleans up gaps and duplicate positions", () => {
    const messy = [
      { id: "a", position: 0 },
      { id: "b", position: 0 },
      { id: "c", position: 5 },
    ];
    const moved = reorder(messy, "c", -1);
    const positions = Object.fromEntries(
      messy.map((m) => [m.id, moved.find((c) => c.id === m.id)?.position ?? m.position]),
    );
    expect(new Set(Object.values(positions)).size).toBe(3);
  });
});

describe("editing a program", () => {
  async function firstDay() {
    await onboard(library);
    const active = (await loadActiveProgram())!;
    const day = active.days[0];
    return { active, day, items: active.planned.filter((p) => p.program_day_id === day.id) };
  }

  it("saves a prescription edit and queues it", async () => {
    const { items } = await firstDay();
    await getDb().outbox.clear();
    const saved = await savePlannedEdit(items[0], { sets: 5, rep_min: 5, rep_max: 8, target_rir: 1, load: 140, rest_seconds: 150 });
    expect(saved).toMatchObject({ sets: 5, rep_min: 5, rep_max: 8, target_rir: 1, load: 140, rest_seconds: 150 });
    expect(saved.updated_at > items[0].updated_at).toBe(true);
    expect(await getDb().outbox.get(`planned_exercises:${items[0].id}`)).toBeTruthy();
    const reloaded = (await loadActiveProgram())!.planned.find((p) => p.id === items[0].id);
    expect(reloaded?.sets).toBe(5);
  });

  it("swapping clears the weight and takes the new exercise's rep range", async () => {
    const { items } = await firstDay();
    const withLoad = await savePlannedEdit(items[0], { ...items[0], load: 135 });
    const dip = bySlug("parallel-bar-dip");
    const swapped = await swapPlannedExercise(withLoad, dip);
    expect(swapped).toMatchObject({ exercise_id: dip.id, load: null, rep_min: dip.default_rep_min, rep_max: dip.default_rep_max });
  });

  it("removes with is_active false, keeps the row, and can restore it", async () => {
    const { day, items } = await firstDay();
    const removed = await setPlannedActive(items[1], false);
    expect(removed.is_active).toBe(false);
    expect(await getDb().planned_exercises.get(items[1].id)).toBeTruthy();
    expect((await loadActiveProgram())!.planned.filter((p) => p.program_day_id === day.id)).toHaveLength(items.length - 1);
    await setPlannedActive(removed, true);
    expect((await loadActiveProgram())!.planned.filter((p) => p.program_day_id === day.id)).toHaveLength(items.length);
  });

  it("adds an exercise at the end with sensible defaults", async () => {
    const { day, items } = await firstDay();
    const curl = bySlug("barbell-curl");
    const added = await addPlannedExercise({ programDayId: day.id, exercise: curl });
    expect(added).toMatchObject({
      program_day_id: day.id,
      exercise_id: curl.id,
      position: Math.max(...items.map((p) => p.position)) + 1,
      sets: 3,
      rep_min: curl.default_rep_min,
      rep_max: curl.default_rep_max,
      target_rir: 2,
      load: null,
      is_active: true,
    });
  });

  it("puts a second added exercise after the first", async () => {
    const { day } = await firstDay();
    const a = await addPlannedExercise({ programDayId: day.id, exercise: bySlug("barbell-curl") });
    const b = await addPlannedExercise({ programDayId: day.id, exercise: bySlug("hammer-curl") });
    expect(b.position).toBe(a.position + 1);
  });

  it("reorders within a day through the database", async () => {
    const { day } = await firstDay();
    const before = (await loadActiveProgram())!.planned.filter((p) => p.program_day_id === day.id);
    await movePlannedExercise(before, before[2].id, -1);
    const after = (await loadActiveProgram())!.planned.filter((p) => p.program_day_id === day.id);
    expect(after.map((p) => p.id)).toEqual([before[0].id, before[2].id, before[1].id, ...before.slice(3).map((p) => p.id)]);
  });
});

describe("createPplProgram", () => {
  it("switches off the previous active program and activates the new one together", async () => {
    await onboard(library);
    const gym = (await getDb().equipment_profiles.toArray()).find((e) => e.name === "Gym")!;
    clock(new Date(NOW.getTime() + 60_000));
    await createPplProgram({ variant: "6day", equipment: gym, library });

    const programs = await getDb().programs.toArray();
    expect(programs).toHaveLength(2);
    expect(programs.filter((p) => p.is_active)).toHaveLength(1);
    const active = (await loadActiveProgram())!;
    expect(active.program.days_per_week).toBe(6);
    expect(active.days).toHaveLength(6);
  });
});
