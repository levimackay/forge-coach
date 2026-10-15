import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "./db";
import { seedDevFixture } from "./dev-fixture";
import { freshLocalState } from "./test-support";

vi.mock("@/lib/supabase/client", async () => {
  const { fakeServer } = await import("./test-support");
  return { getSupabase: () => fakeServer.client };
});

const NOW = new Date(2026, 9, 15, 12, 0, 0);

beforeEach(async () => {
  await freshLocalState();
  vi.stubEnv("NODE_ENV", "development");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("development fixture", () => {
  it("builds five weeks of finished sessions with engine decisions and no queued writes", async () => {
    const { workouts } = await seedDevFixture(NOW);
    const db = getDb();

    expect(workouts).toBeGreaterThanOrEqual(12);
    const all = await db.workouts.toArray();
    expect(all).toHaveLength(workouts);
    expect(all.every((w) => w.status === "completed" && w.completed_at)).toBe(true);
    expect((await db.progression_decisions.count())).toBeGreaterThan(workouts * 4);
    expect(await db.outbox.count()).toBe(0);
    expect(await db.coach_proposals.where("status").equals("pending").count()).toBe(1);
    expect((await db.profiles.toCollection().first())?.onboarded_at).toBeTruthy();
  });

  it("actually progresses: some prescriptions moved from where they started", async () => {
    await seedDevFixture(NOW);
    const decisions = await getDb().progression_decisions.toArray();
    const actions = new Set(decisions.map((d) => d.action));
    expect(actions.has("increase_load") || actions.has("increase_reps")).toBe(true);
    expect(actions.size).toBeGreaterThan(1);
  });

  it("produces the same ids every time", async () => {
    await seedDevFixture(NOW);
    const first = (await getDb().workout_sets.toArray()).map((s) => s.id).sort();
    await freshLocalState();
    vi.stubEnv("NODE_ENV", "development");
    await seedDevFixture(NOW);
    const second = (await getDb().workout_sets.toArray()).map((s) => s.id).sort();
    expect(second).toEqual(first);
    expect(first.length).toBeGreaterThan(200);
  });

  it("refuses to run outside development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(seedDevFixture(NOW)).rejects.toThrow(/development/);
  });
});
