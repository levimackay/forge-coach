import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bindLocalDataToUser, deleteAllMyData, exportAll, importExport, ImportError, UnsyncedChangesError } from "./data";
import { getDb, getMeta, setMeta } from "./db";
import { loadProposals } from "./hooks";
import { approveProposal, NetworkRequiredError, rejectProposal, undoProposal } from "./proposals";
import { recoveryLogId } from "./ids";
import { syncNow } from "./sync";
import { fakeServer, freshLocalState, TEST_USER } from "./test-support";
import { putRow, softDelete } from "./write";

vi.mock("@/lib/supabase/client", async () => {
  const { fakeServer } = await import("./test-support");
  return { getSupabase: () => fakeServer.client };
});

const goal = (description: string) => ({
  kind: "strength" as const,
  description,
  focus_muscles: ["quads" as const],
  target_date: null,
  active: true,
});

beforeEach(async () => {
  await freshLocalState();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const program = (name: string) => ({ name, split: "ppl" as const, days_per_week: 3, is_active: true, version: 1, notes: null });

describe("export and import", () => {
  it("exports every row, soft-deleted ones with their deleted_at, without server bookkeeping", async () => {
    const keep = await putRow("goals", goal("keep"));
    const gone = await putRow("goals", goal("gone"));
    await getDb().goals.update(gone.id, { deleted_at: "2026-10-15T10:00:00.000Z" });
    await getDb().goals.update(keep.id, { server_updated_at: "2026-10-15T09:00:00.000001+00:00" });

    const file = await exportAll(new Date("2026-10-15T12:00:00.000Z"));

    expect(file).toMatchObject({
      format: "forge-coach-export",
      version: 1,
      exported_at: "2026-10-15T12:00:00.000Z",
      user_id: TEST_USER,
    });
    const byId = new Map(file.tables.goals?.map((g) => [g.id, g]));
    expect(byId.get(keep.id)?.deleted_at).toBeNull();
    expect(byId.get(gone.id)?.deleted_at).toBe("2026-10-15T10:00:00.000Z");
    expect(byId.get(keep.id)).not.toHaveProperty("server_updated_at");
  });

  it("restores workouts that point at a deleted equipment profile, because the profile travels too", async () => {
    const hotel = await putRow("equipment_profiles", {
      name: "Hotel gym",
      equipment: ["dumbbells"],
      dumbbell_increment: 5,
      dumbbell_max: 50,
      barbell_increment: null,
      is_default: false,
    });
    const trip = await putRow("workouts", {
      program_day_id: null,
      equipment_profile_id: hotel.id,
      started_at: "2026-10-10T10:00:00.000Z",
      completed_at: "2026-10-10T11:00:00.000Z",
      status: "completed",
      session_rpe: null,
      notes: null,
    });
    await softDelete("equipment_profiles", hotel.id);
    const file = JSON.parse(JSON.stringify(await exportAll()));

    await freshLocalState(); // "Delete all my data": server and device are empty
    await importExport(file);
    await syncNow();

    expect(fakeServer.rows("workouts").map((w) => w.equipment_profile_id)).toEqual([hotel.id]);
    expect(fakeServer.rows("equipment_profiles")).toEqual([expect.objectContaining({ id: hotel.id, deleted_at: expect.any(String) })]);
    expect((await getDb().workouts.get(trip.id))?.equipment_profile_id).toBe(hotel.id);
    expect(await getDb().outbox.count()).toBe(0);
  });

  it("restoring a file whose program was active switches off the one built since, so the server takes both", async () => {
    const old = await putRow("programs", program("Old"));
    const file = JSON.parse(JSON.stringify(await exportAll()));

    await freshLocalState(); // "Delete all my data", then setup builds and syncs a new program
    await putRow("programs", program("New"));
    await syncNow();

    await importExport(file);
    expect((await getDb().programs.filter((p) => p.is_active).toArray()).map((p) => p.id)).toEqual([old.id]);
    await syncNow();
    expect(await getDb().outbox.count()).toBe(0);
    expect(fakeServer.rows("programs").filter((p) => p.is_active).map((p) => p.id)).toEqual([old.id]);
  });

  it("keeps only the newest active program when a file holds more than one", async () => {
    const a = await putRow("programs", program("A"));
    const file = JSON.parse(JSON.stringify(await exportAll()));
    const b = { ...file.tables.programs[0], id: crypto.randomUUID(), name: "B", updated_at: "2099-01-01T00:00:00.000Z" };
    file.tables.programs.push(b);
    await freshLocalState();
    await importExport(file);
    expect((await getDb().programs.filter((p) => p.is_active).toArray()).map((p) => p.id)).toEqual([b.id]);
    expect((await getDb().programs.get(a.id))?.is_active).toBe(false);
  });

  it("an imported check-in for a day this device already has updates that day's log", async () => {
    const day = { date: "2026-10-14", sleep_hours: 7, sleep_quality: null, soreness: 2, energy: null, stress: null, notes: null };
    await putRow("recovery_logs", { ...day, id: crypto.randomUUID() });
    const file = JSON.parse(JSON.stringify(await exportAll()));

    await freshLocalState();
    const mine = await putRow("recovery_logs", { ...day, id: recoveryLogId(TEST_USER, day.date), soreness: 4 });
    await importExport(file);

    const live = (await getDb().recovery_logs.toArray()).filter((r) => !r.deleted_at);
    expect(live.map((r) => r.id)).toEqual([mine.id]);
    expect(live[0].soreness).toBe(2);
  });

  it("gives rows from another account's file new ids and rewrites every reference to them", async () => {
    const other = "22222222-2222-4222-8222-222222222222";
    const libraryId = "33333333-3333-4333-8333-333333333333";
    const custom = await putRow("exercises", {
      slug: "my-curl",
      name: "My curl",
      primary_muscle: "biceps",
      secondary_muscles: [],
      movement_pattern: "elbow_flexion",
      equipment: ["dumbbells"],
      load_type: "external",
      progression_group: null,
      ladder_level: null,
      default_rep_min: 8,
      default_rep_max: 12,
      default_increment: 5,
      notes: null,
    });
    const prog = await putRow("programs", program("Shared"));
    const day = await putRow("program_days", { program_id: prog.id, position: 0, name: "Arms", focus: "pull", equipment_profile_id: null });
    const pe = (exercise_id: string, position: number) => ({
      program_day_id: day.id, position, exercise_id, sets: 3, rep_min: 8, rep_max: 12, target_rir: 2, load: 20, rest_seconds: null, notes: null, is_active: true,
    });
    const peCustom = await putRow("planned_exercises", pe(custom.id, 0));
    const peLibrary = await putRow("planned_exercises", pe(libraryId, 1));
    const w = await putRow("workouts", {
      program_day_id: day.id, equipment_profile_id: null, started_at: "2026-10-10T10:00:00.000Z",
      completed_at: "2026-10-10T11:00:00.000Z", status: "completed", session_rpe: null, notes: null,
    });
    const s = await putRow("workout_sets", {
      workout_id: w.id, planned_exercise_id: peCustom.id, exercise_id: custom.id, set_index: 0, reps: 10, load: 20, rir: 2,
      is_warmup: false, pain: false, completed_at: "2026-10-10T10:10:00.000Z", notes: null,
    });
    const snap = { exercise_id: custom.id, sets: 3, rep_min: 8, rep_max: 12, target_rir: 2, load: 20 };
    const d = await putRow("progression_decisions", {
      planned_exercise_id: peCustom.id, workout_id: w.id, decided_at: "2026-10-10T11:00:00.000Z", engine_version: "1.0.0",
      action: "hold", before: snap, after: snap, reason: "Hold.", inputs: { to_exercise_id: custom.id },
    });
    const r = await putRow("recovery_logs", { date: "2026-10-14", sleep_hours: 7, sleep_quality: null, soreness: 2, energy: null, stress: null, notes: null });
    const file = JSON.parse(JSON.stringify(await exportAll()));
    file.user_id = other;
    for (const rows of Object.values(file.tables) as Record<string, unknown>[][]) for (const row of rows) row.user_id = other;
    const original = new Set([custom.id, prog.id, day.id, peCustom.id, peLibrary.id, w.id, s.id, d.id, r.id]);

    await freshLocalState(); // signed in as TEST_USER, the importing account
    await importExport(file);

    const db = getDb();
    const [ex] = await db.exercises.toArray();
    const [p] = await db.programs.toArray();
    const [dd] = await db.program_days.toArray();
    const pes = await db.planned_exercises.toArray();
    const [ww] = await db.workouts.toArray();
    const [ss] = await db.workout_sets.toArray();
    const [dec] = await db.progression_decisions.toArray();
    const [rr] = await db.recovery_logs.toArray();
    for (const row of [ex, p, dd, ...pes, ww, ss, dec, rr]) {
      expect(original.has(row.id)).toBe(false);
      expect(row.user_id).toBe(TEST_USER);
    }
    expect(dd.program_id).toBe(p.id);
    expect(pes.map((x) => [x.program_day_id, x.exercise_id]).sort()).toEqual([[dd.id, ex.id], [dd.id, libraryId]].sort());
    const newPeCustom = pes.find((x) => x.exercise_id === ex.id)!;
    expect([ss.workout_id, ss.planned_exercise_id, ss.exercise_id]).toEqual([ww.id, newPeCustom.id, ex.id]);
    expect([dec.planned_exercise_id, dec.workout_id, dec.before.exercise_id, dec.after.exercise_id, dec.inputs.to_exercise_id]).toEqual([
      newPeCustom.id, ww.id, ex.id, ex.id, ex.id,
    ]);
    expect(ww.program_day_id).toBe(dd.id);
    expect(rr.id).toBe(recoveryLogId(TEST_USER, "2026-10-14"));
  });

  it("round-trips through JSON into an empty device", async () => {
    const kept = await putRow("goals", goal("squat 405"));
    const file = JSON.parse(JSON.stringify(await exportAll()));

    await freshLocalState();
    const result = await importExport(file);

    expect(result.imported.goals).toBe(1);
    const restored = await getDb().goals.get(kept.id);
    expect(restored?.description).toBe("squat 405");
    expect(restored?.user_id).toBe(TEST_USER);
    expect(await getDb().outbox.get(`goals:${kept.id}`)).toBeTruthy();
  });

  it("upserts by id so importing twice does not duplicate", async () => {
    await putRow("goals", goal("a"));
    const file = await exportAll();
    await importExport(file);
    await importExport(file);
    expect(await getDb().goals.count()).toBe(1);
  });

  it("rejects a file that is not an export", async () => {
    await expect(importExport({ hello: "world" })).rejects.toBeInstanceOf(ImportError);
    await expect(importExport("nope")).rejects.toBeInstanceOf(ImportError);
  });

  it("rejects out-of-range values instead of importing them", async () => {
    const goalRow = await putRow("goals", goal("a"));
    const file = await exportAll();
    const bad = JSON.parse(JSON.stringify(file));
    bad.tables.workout_sets = [
      {
        id: crypto.randomUUID(),
        user_id: TEST_USER,
        created_at: "2026-10-15T10:00:00.000Z",
        updated_at: "2026-10-15T10:00:00.000Z",
        deleted_at: null,
        workout_id: crypto.randomUUID(),
        planned_exercise_id: null,
        exercise_id: crypto.randomUUID(),
        set_index: 0,
        reps: 5000,
        load: 100,
        rir: 2,
        is_warmup: false,
        pain: false,
        completed_at: "2026-10-15T10:00:00.000Z",
        notes: null,
      },
    ];
    await expect(importExport(bad)).rejects.toThrow(/reps/);
    expect(await getDb().goals.count()).toBe(1);
    expect(goalRow.id).toBeTruthy();
  });

  it("skips server-owned tables and library exercises", async () => {
    const file = await exportAll();
    file.tables.coach_proposals = [];
    const result = await importExport({
      ...file,
      tables: {
        ...file.tables,
        audit_log: [
          {
            id: crypto.randomUUID(),
            user_id: TEST_USER,
            at: "2026-10-15T10:00:00.000Z",
            actor: "user",
            client_id: null,
            action: "x",
            entity: "y",
            entity_id: null,
            details: {},
          },
        ],
      },
    });
    expect(result.skipped).toBe(1);
    expect(await getDb().audit_log.count()).toBe(0);
  });
});

describe("account binding", () => {
  it("drops another account's synced cache when a different user signs in", async () => {
    await bindLocalDataToUser(TEST_USER);
    await putRow("goals", goal("mine"));
    await setMeta("cursor:goals", "2026-10-15T09:00:00.000001+00:00");

    await bindLocalDataToUser(TEST_USER);
    expect(await getDb().goals.count()).toBe(1);

    await getDb().outbox.clear(); // everything reached the server
    await bindLocalDataToUser("22222222-2222-4222-8222-222222222222");
    expect(await getDb().goals.count()).toBe(0);
    expect(await getDb().outbox.count()).toBe(0);
    expect(await getMeta("cursor:goals")).toBeUndefined();
    expect(await getMeta("owner")).toBe("22222222-2222-4222-8222-222222222222");
  });

  it("refuses to drop another account's unsynced changes unless told to", async () => {
    const other = "22222222-2222-4222-8222-222222222222";
    await bindLocalDataToUser(TEST_USER);
    await putRow("goals", goal("not synced yet"));

    await expect(bindLocalDataToUser(other)).rejects.toBeInstanceOf(UnsyncedChangesError);
    expect(await getDb().goals.count()).toBe(1);
    expect(await getDb().outbox.count()).toBe(1);
    expect(await getMeta("owner")).toBe(TEST_USER);

    await bindLocalDataToUser(other, { discardUnsynced: true });
    expect(await getDb().goals.count()).toBe(0);
    expect(await getMeta("owner")).toBe(other);
  });
});

describe("deleteAllMyData", () => {
  it("lets a sync pass that already started finish before wiping, so it cannot write old rows back", async () => {
    fakeServer.apply("goals", {
      id: crypto.randomUUID(),
      user_id: TEST_USER,
      created_at: "2026-10-15T09:00:00.000Z",
      updated_at: "2026-10-15T09:00:00.000Z",
      deleted_at: null,
      ...goal("on the server"),
    });
    let release!: () => void;
    fakeServer.selectGate = new Promise<void>((resolve) => (release = resolve));
    const pass = syncNow();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const wipe = deleteAllMyData();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fakeServer.rpcCalls).toHaveLength(0);

    fakeServer.selectGate = null;
    release();
    await Promise.all([pass, wipe]);
    expect(fakeServer.rpcCalls.map((c) => c.name)).toEqual(["delete_my_data"]);
    expect(await getDb().goals.count()).toBe(0);
  });

  it("asks the server first, then empties the device", async () => {
    await bindLocalDataToUser(TEST_USER);
    await putRow("goals", goal("a"));
    await deleteAllMyData();

    expect(fakeServer.rpcCalls.map((c) => c.name)).toEqual(["delete_my_data"]);
    expect(await getDb().goals.count()).toBe(0);
    expect(await getDb().outbox.count()).toBe(0);
    expect(await getMeta("owner")).toBe(TEST_USER);
  });

  it("keeps local data when offline", async () => {
    await putRow("goals", goal("a"));
    vi.stubGlobal("navigator", { onLine: false });
    await expect(deleteAllMyData()).rejects.toBeInstanceOf(NetworkRequiredError);
    expect(await getDb().goals.count()).toBe(1);
  });

  it("keeps local data when the server refuses", async () => {
    await putRow("goals", goal("a"));
    fakeServer.rpcResult = { data: null, error: { message: "not allowed" }, status: 403 };
    await expect(deleteAllMyData()).rejects.toThrow("not allowed");
    expect(await getDb().goals.count()).toBe(1);
  });
});

describe("proposal actions", () => {
  const proposal = (status: string) => ({
    id: "33333333-3333-4333-8333-333333333333",
    user_id: TEST_USER,
    created_at: "2026-10-15T08:00:00.000000+00:00",
    updated_at: "2026-10-15T09:30:00.000000+00:00",
    server_updated_at: "2026-10-15T09:30:00.000000+00:00",
    source: "claude",
    client_id: "abc",
    program_id: "44444444-4444-4444-8444-444444444444",
    base_program_version: 1,
    title: "More back volume",
    rationale: "Rows lag",
    changes: [],
    inverse_changes: null,
    status,
    decided_at: null,
    applied_at: null,
    undone_at: null,
    decision_note: null,
  });

  it("approve calls the RPC with the proposal id and stores the returned row", async () => {
    fakeServer.rpcResult = { data: proposal("applied"), error: null, status: 200 };
    const row = await approveProposal(proposal("pending").id, "looks right");

    expect(fakeServer.rpcCalls).toEqual([
      { name: "approve_proposal", args: { p_id: proposal("pending").id, p_note: "looks right" } },
    ]);
    expect(row?.status).toBe("applied");
    expect((await loadProposals("applied")).map((p) => p.id)).toEqual([proposal("pending").id]);
  });

  it("reject and undo use their own RPCs", async () => {
    fakeServer.rpcResult = { data: proposal("rejected"), error: null, status: 200 };
    await rejectProposal(proposal("pending").id);
    fakeServer.rpcResult = { data: proposal("undone"), error: null, status: 200 };
    await undoProposal(proposal("pending").id);
    expect(fakeServer.rpcCalls.map((c) => c.name)).toEqual(["reject_proposal", "undo_proposal"]);
  });

  it("needs the network and never calls the server offline", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    await expect(approveProposal(proposal("pending").id)).rejects.toBeInstanceOf(NetworkRequiredError);
    expect(fakeServer.rpcCalls).toHaveLength(0);
  });

  it("surfaces the server's reason when a decision is refused", async () => {
    fakeServer.rpcResult = {
      data: null,
      error: { message: "Proposal is no longer pending" },
      status: 400,
    };
    await expect(approveProposal(proposal("pending").id)).rejects.toThrow("Proposal is no longer pending");
  });

  it("pushes pending local edits before asking the server to apply a change", async () => {
    await putRow("goals", goal("unsynced"));
    fakeServer.rpcResult = { data: proposal("applied"), error: null, status: 200 };
    await approveProposal(proposal("pending").id);
    expect(fakeServer.upsertCalls.map((c) => c.table)).toEqual(["goals"]);
    expect(fakeServer.rows("goals")).toHaveLength(1);
  });
});
