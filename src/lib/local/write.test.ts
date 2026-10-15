import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "./db";
import { loadWorkout, loadWorkouts } from "./hooks";
import { setActiveUserId } from "./session";
import { freshLocalState, TEST_USER } from "./test-support";
import { putRow, putRows, softDelete } from "./write";

vi.mock("@/lib/supabase/client", async () => {
  const { fakeServer } = await import("./test-support");
  return { getSupabase: () => fakeServer.client };
});

const goal = (description: string) => ({
  kind: "hypertrophy" as const,
  description,
  focus_muscles: ["chest" as const],
  target_date: null,
  active: true,
});

beforeEach(async () => {
  await freshLocalState();
});

describe("putRow", () => {
  it("fills id, user, timestamps and queues the row", async () => {
    const row = await putRow("goals", goal("bigger chest"));

    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.user_id).toBe(TEST_USER);
    expect(row.created_at).toBe(row.updated_at);
    expect(row.deleted_at).toBeNull();
    expect(await getDb().goals.get(row.id)).toEqual(row);

    const entry = await getDb().outbox.get(`goals:${row.id}`);
    expect(entry).toMatchObject({ table: "goals", row_id: row.id, rev: 1, parked: 0 });
  });

  it("keeps created_at and always moves updated_at forward, even within one millisecond", async () => {
    const first = await putRow("goals", goal("a"));
    const second = await putRow("goals", { ...first, description: "b" });
    const third = await putRow("goals", { ...second, description: "c" });

    expect(second.created_at).toBe(first.created_at);
    expect(Date.parse(second.updated_at)).toBeGreaterThan(Date.parse(first.updated_at));
    expect(Date.parse(third.updated_at)).toBeGreaterThan(Date.parse(second.updated_at));
    expect((await getDb().outbox.get(`goals:${first.id}`))?.rev).toBe(3);
  });

  it("ignores a stale updated_at and a foreign user_id passed in the input", async () => {
    const first = await putRow("goals", goal("a"));
    const edited = await putRow("goals", {
      ...first,
      user_id: "99999999-9999-4999-8999-999999999999",
      updated_at: "2000-01-01T00:00:00.000Z",
      description: "b",
    });
    expect(edited.user_id).toBe(TEST_USER);
    expect(Date.parse(edited.updated_at)).toBeGreaterThan(Date.parse(first.updated_at));
  });

  it("keeps server_updated_at out of what callers can set but preserves the stored one", async () => {
    const first = await putRow("goals", goal("a"));
    await getDb().goals.update(first.id, { server_updated_at: "2026-10-15T12:00:00.000001+00:00" });
    const edited = await putRow("goals", { ...goal("b"), id: first.id, server_updated_at: "1999-01-01T00:00:00Z" });
    expect(edited.server_updated_at).toBe("2026-10-15T12:00:00.000001+00:00");
  });

  it("keys the profile by the signed-in user", async () => {
    const profile = await putRow("profiles", {
      display_name: "Levi",
      unit: "lb",
      bodyweight: 180,
      timezone: "America/Denver",
      onboarded_at: null,
    });
    expect(profile.user_id).toBe(TEST_USER);
    expect(await getDb().profiles.count()).toBe(1);
    await putRow("profiles", { ...profile, display_name: "L" });
    expect(await getDb().profiles.count()).toBe(1);
  });

  it("refuses to edit a library exercise", async () => {
    const id = crypto.randomUUID();
    await getDb().exercises.put({
      id,
      user_id: null,
      slug: "squat",
      name: "Squat",
      primary_muscle: "quads",
      secondary_muscles: [],
      movement_pattern: "squat",
      equipment: ["barbell"],
      load_type: "external",
      progression_group: null,
      ladder_level: null,
      default_rep_min: 5,
      default_rep_max: 8,
      default_increment: 5,
      notes: null,
      created_at: "2026-10-01T00:00:00.000Z",
      updated_at: "2026-10-01T00:00:00.000Z",
      deleted_at: null,
    });
    const existing = (await getDb().exercises.get(id))!;
    await expect(putRow("exercises", { ...existing, name: "Mine" })).rejects.toThrow(/read-only/i);
  });

  it("requires a signed-in user", async () => {
    setActiveUserId(null);
    await expect(putRow("goals", goal("a"))).rejects.toThrow(/not signed in/i);
  });
});

describe("putRows", () => {
  it("writes a batch atomically with one outbox entry per row", async () => {
    const rows = await putRows("goals", [goal("a"), goal("b"), goal("c")]);
    expect(await getDb().goals.count()).toBe(3);
    expect((await getDb().outbox.toArray()).map((e) => e.row_id).sort()).toEqual(rows.map((r) => r.id).sort());
  });
});

describe("softDelete", () => {
  it("keeps the row for sync, hides it from queries and queues the delete", async () => {
    const w = await putRow("workouts", {
      program_day_id: null,
      equipment_profile_id: null,
      started_at: "2026-10-15T10:00:00.000Z",
      completed_at: null,
      status: "in_progress",
      session_rpe: null,
      notes: null,
    });
    await getDb().outbox.clear();

    await softDelete("workouts", w.id);

    const stored = await getDb().workouts.get(w.id);
    expect(stored?.deleted_at).toBeTruthy();
    expect(Date.parse(stored!.updated_at)).toBeGreaterThan(Date.parse(w.updated_at));
    expect(await getDb().outbox.get(`workouts:${w.id}`)).toBeTruthy();
    expect(await loadWorkout(w.id)).toBeNull();
    expect(await loadWorkouts()).toEqual([]);
  });

  it("does nothing for a missing or already deleted row", async () => {
    await softDelete("workouts", crypto.randomUUID());
    expect(await getDb().outbox.count()).toBe(0);
  });
});
