import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Workout } from "@/lib/domain/types";
import { getDb, getMeta } from "./db";
import { applyPulled, backoffDelayMs, classify, getSyncState, resetSyncForTests, syncNow } from "./sync";
import { fakeServer, freshLocalState, TEST_USER } from "./test-support";
import { putRow } from "./write";

vi.mock("@/lib/supabase/client", async () => {
  const { fakeServer } = await import("./test-support");
  return { getSupabase: () => fakeServer.client };
});

const workoutInput = (over: Partial<Workout> = {}) => ({
  program_day_id: null,
  equipment_profile_id: null,
  started_at: "2026-10-15T10:00:00.000Z",
  completed_at: null,
  status: "in_progress" as const,
  session_rpe: null,
  notes: null,
  ...over,
});

beforeEach(async () => {
  await freshLocalState();
});

afterEach(() => {
  resetSyncForTests();
  vi.unstubAllGlobals();
});

describe("push", () => {
  it("sends each row once with onConflict=id and never sends server_updated_at", async () => {
    const row = await putRow("workouts", workoutInput());
    await syncNow();

    expect(fakeServer.upsertCalls).toHaveLength(1);
    expect(fakeServer.upsertCalls[0].onConflict).toBe("id");
    expect(fakeServer.upsertCalls[0].rows[0]).not.toHaveProperty("server_updated_at");
    expect(fakeServer.rows("workouts")).toHaveLength(1);
    expect(fakeServer.rows("workouts")[0].id).toBe(row.id);
    expect(await getDb().outbox.count()).toBe(0);
  });

  it("keys profiles by user_id", async () => {
    await putRow("profiles", {
      display_name: "Levi",
      unit: "lb",
      bodyweight: null,
      timezone: "America/Denver",
      onboarded_at: null,
    });
    await syncNow();
    expect(fakeServer.upsertCalls[0].onConflict).toBe("user_id");
    expect(fakeServer.rows("profiles")[0].user_id).toBe(TEST_USER);
  });

  it("a duplicate submission of the same id leaves one server row", async () => {
    const id = crypto.randomUUID();
    await putRow("workouts", { ...workoutInput(), id });
    await putRow("workouts", { ...workoutInput({ notes: "second tap" }), id });
    await syncNow();
    await putRow("workouts", { ...workoutInput({ notes: "third tap" }), id });
    await syncNow();

    expect(fakeServer.rows("workouts")).toHaveLength(1);
    expect(fakeServer.rows("workouts")[0].notes).toBe("third tap");
  });

  it("a lost response is retried and does not duplicate the row", async () => {
    await putRow("workouts", workoutInput());
    fakeServer.failures.push({ status: 0, message: "TypeError: Failed to fetch", applyFirst: true });

    await syncNow();
    expect(getSyncState().error).toMatch(/connection/i);
    expect(await getDb().outbox.count()).toBe(1);
    expect(fakeServer.rows("workouts")).toHaveLength(1);

    await syncNow();
    expect(getSyncState().error).toBeNull();
    expect(await getDb().outbox.count()).toBe(0);
    expect(fakeServer.rows("workouts")).toHaveLength(1);
    expect(fakeServer.upsertCalls).toHaveLength(2);
  });

  it("keeps the write pending when the server answers with a transient error", async () => {
    await putRow("workouts", workoutInput());
    fakeServer.failures.push({ status: 503, message: "unavailable" });
    await syncNow();
    expect(await getDb().outbox.count()).toBe(1);
    expect(getSyncState().lastSyncedAt).toBeNull();
  });

  it("runs one sync at a time", async () => {
    await putRow("workouts", workoutInput());
    await Promise.all([syncNow(), syncNow(), syncNow()]);
    expect(fakeServer.upsertCalls).toHaveLength(1);
  });

  it("does not clear an edit made while the push was in flight", async () => {
    const id = crypto.randomUUID();
    await putRow("workouts", { ...workoutInput(), id });
    fakeServer.beforeRespond = async () => {
      fakeServer.beforeRespond = null;
      await putRow("workouts", { ...workoutInput({ notes: "typed during sync" }), id });
    };
    await syncNow();

    // The first push carried the old version; the newer edit is still queued.
    expect(fakeServer.rows("workouts")[0].notes).toBeNull();
    expect(await getDb().outbox.count()).toBe(1);

    await syncNow();
    expect(fakeServer.rows("workouts")[0].notes).toBe("typed during sync");
    expect(await getDb().outbox.count()).toBe(0);
  });

  it("isolates a rejected row, syncs the rest, and parks it after repeated rejections", async () => {
    const bad = await putRow("workouts", workoutInput({ notes: "bad" }));
    const good = await putRow("workouts", workoutInput({ notes: "good" }));
    fakeServer.rejectIds.add(bad.id);

    for (let i = 0; i < 5; i++) await syncNow();

    expect(fakeServer.rows("workouts").map((r) => r.id)).toEqual([good.id]);
    const entry = await getDb().outbox.get(`workouts:${bad.id}`);
    expect(entry?.parked).toBe(1);
    expect(entry?.attempts).toBe(5);
    expect(getSyncState().error).toMatch(/rejected/i);

    const callsBefore = fakeServer.upsertCalls.length;
    await syncNow();
    expect(fakeServer.upsertCalls.length).toBe(callsBefore);
  });

  it("does nothing while the device reports offline", async () => {
    await putRow("workouts", workoutInput());
    vi.stubGlobal("navigator", { onLine: false });
    await syncNow();
    expect(fakeServer.upsertCalls).toHaveLength(0);
    expect(await getDb().outbox.count()).toBe(1);
  });
});

describe("pull", () => {
  const remoteWorkout = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    user_id: TEST_USER,
    created_at: "2026-10-15T09:00:00.000000+00:00",
    updated_at: "2026-10-15T09:00:00.000000+00:00",
    deleted_at: null,
    ...workoutInput(),
    ...over,
  });

  it("inserts rows the device has not seen and normalizes timestamps", async () => {
    const id = crypto.randomUUID();
    fakeServer.apply("workouts", remoteWorkout(id, { started_at: "2026-10-14T18:30:00.5+00:00" }));
    await syncNow();

    const local = await getDb().workouts.get(id);
    expect(local?.started_at).toBe("2026-10-14T18:30:00.500Z");
    expect(local?.server_updated_at).toBeTruthy();
  });

  it("a newer remote edit replaces a pending local one and drops it from the outbox", async () => {
    const local = await putRow("workouts", workoutInput({ notes: "local" }));
    await applyPulled("workouts", [
      remoteWorkout(local.id, {
        notes: "remote",
        updated_at: new Date(Date.parse(local.updated_at) + 60_000).toISOString(),
      }),
    ]);

    expect((await getDb().workouts.get(local.id))?.notes).toBe("remote");
    expect(await getDb().outbox.count()).toBe(0);
  });

  it("an older remote edit never overwrites a pending local one", async () => {
    const local = await putRow("workouts", workoutInput({ notes: "local" }));
    await applyPulled("workouts", [
      remoteWorkout(local.id, {
        notes: "stale remote",
        updated_at: new Date(Date.parse(local.updated_at) - 60_000).toISOString(),
      }),
    ]);

    expect((await getDb().workouts.get(local.id))?.notes).toBe("local");
    expect(await getDb().outbox.count()).toBe(1);
  });

  it("an offline edit made before another device's newer edit loses: the push is ignored and the pull restores the newer row", async () => {
    const local = await putRow("workouts", workoutInput({ notes: "offline edit" }));
    fakeServer.apply(
      "workouts",
      remoteWorkout(local.id, {
        notes: "other device",
        updated_at: new Date(Date.parse(local.updated_at) + 60_000).toISOString(),
      }),
    );
    await syncNow();

    expect(fakeServer.rows("workouts")[0].notes).toBe("other device");
    expect((await getDb().workouts.get(local.id))?.notes).toBe("other device");
    expect(await getDb().outbox.count()).toBe(0);
  });

  it("a newer local edit wins on the server and stays on the device", async () => {
    const local = await putRow("workouts", workoutInput({ notes: "newer local" }));
    fakeServer.apply(
      "workouts",
      remoteWorkout(local.id, {
        notes: "older remote",
        updated_at: new Date(Date.parse(local.updated_at) - 60_000).toISOString(),
      }),
    );
    await syncNow();

    expect(fakeServer.rows("workouts")[0].notes).toBe("newer local");
    expect((await getDb().workouts.get(local.id))?.notes).toBe("newer local");
  });

  it("advances the cursor and only asks for rows from just before it next time", async () => {
    fakeServer.apply("workouts", remoteWorkout(crypto.randomUUID()));
    fakeServer.apply("workouts", remoteWorkout(crypto.randomUUID()));
    await syncNow();

    const cursor = await getMeta<string>("cursor:workouts");
    const latest = fakeServer.rows("workouts").map((r) => r.server_updated_at as string).sort().at(-1);
    expect(cursor).toBe(latest);

    fakeServer.selectCalls.length = 0;
    await syncNow();
    const call = fakeServer.selectCalls.find((c) => c.table === "workouts");
    expect(call?.filters[0]).toMatch(/^gte server_updated_at 2026-10-15T/);

    fakeServer.apply("workouts", remoteWorkout(crypto.randomUUID()));
    await syncNow();
    expect(await getMeta<string>("cursor:workouts")).not.toBe(cursor);
    expect(await getDb().workouts.count()).toBe(3);
  });

  it("pages through more rows than one request returns, even when timestamps tie", async () => {
    const same = "2026-10-15T12:00:00.000001+00:00";
    const table = fakeServer.table("workouts");
    for (let i = 0; i < 1200; i++) {
      const id = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
      table.set(id, { ...remoteWorkout(id), server_updated_at: same });
    }
    await syncNow();

    expect(await getDb().workouts.count()).toBe(1200);
    const pages = fakeServer.selectCalls.filter((c) => c.table === "workouts");
    expect(pages.length).toBeGreaterThanOrEqual(3);
    expect(pages.slice(1).every((c) => c.filters[0].startsWith("or "))).toBe(true);
  });

  it("pulls global and own exercises and the read-only proposal cache", async () => {
    const globalId = crypto.randomUUID();
    fakeServer.apply("exercises", {
      id: globalId,
      user_id: null,
      slug: "bench-press",
      name: "Bench press",
      created_at: "2026-10-01T00:00:00.000Z",
      updated_at: "2026-10-01T00:00:00.000Z",
      deleted_at: null,
    });
    const proposalId = crypto.randomUUID();
    fakeServer.apply("coach_proposals", {
      id: proposalId,
      user_id: TEST_USER,
      title: "Add a set",
      status: "pending",
      created_at: "2026-10-15T08:00:00.000Z",
      updated_at: "2026-10-15T08:00:00.000Z",
    });
    await syncNow();

    expect((await getDb().exercises.get(globalId))?.user_id).toBeNull();
    expect((await getDb().coach_proposals.get(proposalId))?.title).toBe("Add a set");
    expect(getSyncState().hydrated).toBe(true);
  });
});

describe("a wipe made on another device", () => {
  const wipeEntry = (at: string) => ({
    id: crypto.randomUUID(),
    user_id: TEST_USER,
    at,
    actor: "user",
    client_id: null,
    action: "delete_my_data",
    entity: "account",
    entity_id: TEST_USER,
    details: {},
  });

  it("clears this device and drops its queued writes instead of re-creating them", async () => {
    await putRow("workouts", workoutInput({ notes: "synced before the wipe" }));
    await syncNow();
    expect(fakeServer.rows("workouts")).toHaveLength(1);

    // The laptop runs "Delete all my data": the rows are gone and one audit entry is left.
    fakeServer.tables.clear();
    fakeServer.apply("audit_log", wipeEntry("2026-10-15T13:00:00.000Z"));
    // Meanwhile this phone logs something before it hears about the wipe.
    await putRow("workouts", workoutInput({ notes: "logged on the phone" }));
    const pushes = fakeServer.upsertCalls.length;

    await syncNow();
    expect(fakeServer.upsertCalls.length).toBe(pushes);
    expect(fakeServer.rows("workouts")).toHaveLength(0);
    expect(await getDb().workouts.count()).toBe(0);
    expect(await getDb().outbox.count()).toBe(0);
    expect(getSyncState().hydrated).toBe(true);

    // The same wipe is not acted on twice, and new work syncs normally.
    await putRow("workouts", workoutInput({ notes: "after" }));
    await syncNow();
    expect(fakeServer.rows("workouts").map((w) => w.notes)).toEqual(["after"]);
  });

  it("only notes an old wipe on a device's first sync, keeping what the device holds", async () => {
    fakeServer.apply("audit_log", wipeEntry("2026-10-01T13:00:00.000Z"));
    await putRow("workouts", workoutInput({ notes: "new device" }));
    await syncNow();
    expect(fakeServer.rows("workouts").map((w) => w.notes)).toEqual(["new device"]);
    expect(await getDb().workouts.count()).toBe(1);

    await syncNow();
    expect(await getDb().workouts.count()).toBe(1);
  });
});

describe("retry policy", () => {
  it("backs off exponentially with jitter and caps at five minutes", () => {
    expect(backoffDelayMs(1, 1)).toBe(2000);
    expect(backoffDelayMs(2, 1)).toBe(4000);
    expect(backoffDelayMs(3, 1)).toBe(8000);
    expect(backoffDelayMs(3, 0)).toBe(4000);
    expect(backoffDelayMs(30, 1)).toBe(300_000);
  });

  it("treats network, auth and server errors as transient and data errors as rejections", () => {
    const err = { message: "x" };
    expect(classify({ error: null, status: 201 })).toBe("ok");
    expect(classify({ error: err, status: 0 })).toBe("transient");
    expect(classify({ error: err, status: 401 })).toBe("transient");
    expect(classify({ error: err, status: 503 })).toBe("transient");
    expect(classify({ error: err, status: 400 })).toBe("data");
    expect(classify({ error: err, status: 409 })).toBe("data");
  });
});
