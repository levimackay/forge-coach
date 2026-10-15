import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Exercise, SyncedTable } from "@/lib/domain/types";
import { getDb } from "@/lib/local/db";
import { freshLocalState } from "@/lib/local/test-support";
import { putRow } from "@/lib/local/write";
import type { OnboardingDraft } from "./onboarding-model";
import {
  buildPlan,
  getSwaps,
  itemNote,
  loadHistory,
  loadLastSession,
  loadPlanContext,
  loadSessionData,
  loadToday,
  loadWorkoutData,
  resolveEquipment,
  setSwap,
} from "./queries";
import { deleteWorkout, discardWorkout, logSet, removeSet, restoreSet, saveSetEdit, startWorkout } from "./session-actions";
import { NOW, clock, draft, finish, onboard as onboardWith, trainDay } from "./test-flow";
import { seededLibrary } from "./test-library";

vi.mock("@/lib/supabase/client", async () => {
  const { fakeServer } = await import("@/lib/local/test-support");
  return { getSupabase: () => fakeServer.client };
});

let library: Exercise[];
beforeAll(async () => {
  library = await seededLibrary();
});

const onboard = (extra: Partial<OnboardingDraft> = {}) => onboardWith(library, extra);

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  clock(NOW);
  await freshLocalState();
  await getDb().exercises.bulkPut(library);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("today", () => {
  it("reports no program before onboarding", async () => {
    expect(await loadToday(null)).toBeNull();
  });

  it("starts at the first day and plans every exercise", async () => {
    await onboard();
    const today = (await loadToday(null))!;
    expect(today.ctx.day.name).toBe("Push");
    expect(today.nextDayId).toBe(today.ctx.day.id);
    expect(today.inProgress).toBeNull();
    expect(today.recoveryToday).toBeNull();
    const plan = buildPlan(today.ctx, resolveEquipment(today.ctx, null), NOW.toISOString());
    expect(plan).toHaveLength(today.ctx.planned.length);
    expect(plan.length).toBeGreaterThanOrEqual(5);
  });

  it("lets the lifter look at another day without moving the rotation", async () => {
    await onboard();
    const first = (await loadToday(null))!;
    const pull = first.ctx.days.find((d) => d.name === "Pull")!;
    const other = (await loadToday(pull.id))!;
    expect(other.ctx.day.id).toBe(pull.id);
    expect(other.nextDayId).toBe(first.nextDayId);
  });

  it("falls back to the next day when the picked day does not exist", async () => {
    await onboard();
    expect((await loadToday("nope"))!.ctx.day.name).toBe("Push");
  });

  it("swaps exercises that need equipment the chosen profile lacks", async () => {
    await onboard();
    const today = (await loadToday(null))!;
    const gym = today.ctx.equipmentProfiles.find((e) => e.name === "Gym")!;
    const home = today.ctx.equipmentProfiles.find((e) => e.name === "Home")!;
    const atGym = buildPlan(today.ctx, gym, NOW.toISOString());
    const atHome = buildPlan(today.ctx, home, NOW.toISOString());
    expect(atGym.filter((i) => i.decision.action === "substitute_equipment")).toHaveLength(0);
    const swapped = atHome.filter((i) => i.decision.action === "substitute_equipment");
    expect(swapped.length).toBeGreaterThan(0);
    for (const item of swapped) {
      expect(item.exercise.id).not.toBe(item.planned.exercise_id);
      expect(item.exercise.equipment.every((c) => c === "bodyweight" || home.equipment.includes(c))).toBe(true);
      expect(itemNote(item, undefined)?.text).toMatch(/instead/);
    }
  });

  it("resolves the equipment profile: preferred, then the day's, then the default", async () => {
    await onboard();
    const { ctx } = (await loadToday(null))!;
    const home = ctx.equipmentProfiles.find((e) => e.name === "Home")!;
    expect(resolveEquipment(ctx, home.id)?.name).toBe("Home");
    expect(resolveEquipment(ctx, null)?.name).toBe("Gym");
    expect(resolveEquipment(ctx, "missing")?.name).toBe("Gym");
  });
});

describe("a full session", () => {
  it("logs sets, finishes, and moves the rotation and the plan forward", async () => {
    await onboard();
    const firstDay = (await loadToday(null))!.ctx.day;
    const workout = await trainDay(firstDay.id, 10, NOW);

    const mid = (await loadToday(null))!;
    expect(mid.inProgress?.id).toBe(workout.id);
    expect(mid.nextDayId).toBe(firstDay.id);

    const finishAt = new Date(NOW.getTime() + 50 * 60_000);
    const { decisions } = await finish(workout.id, finishAt, { session_rpe: 8 });
    expect(decisions.length).toBeGreaterThan(0);

    const after = (await loadToday(null))!;
    expect(after.ctx.day.name).toBe("Pull");
    expect(after.inProgress).toBeNull();
    expect(after.lastCompleted?.id).toBe(workout.id);

    // The push day's plan now reflects the session and explains why.
    const pushCtx = (await loadPlanContext(firstDay.id))!;
    const plan = buildPlan(pushCtx, resolveEquipment(pushCtx, null), new Date(finishAt.getTime() + 60_000).toISOString());
    const notes = plan.map((item) => itemNote(item, pushCtx.lastDecisions[item.planned.id]));
    // Every exercise that was trained says why it is what it is, held or not.
    expect(notes.every((n) => n !== null && n.text.length > 10)).toBe(true);
    expect(notes.some((n) => n!.action === "increase_load" || n!.action === "increase_reps")).toBe(true);

    // A manual edit after the session means the recorded sentence no longer describes the plan.
    const edited = { ...plan[0], planned: { ...plan[0].planned, sets: plan[0].planned.sets + 1 } };
    expect(itemNote(edited, pushCtx.lastDecisions[edited.planned.id])).toBeNull();
  });

  it("gives every set its own index within the planned exercise, even when logged at once", async () => {
    await onboard();
    const ctx = (await loadToday(null))!.ctx;
    const planned = ctx.planned[0];
    const exercise = library.find((e) => e.id === planned.exercise_id)!;
    const workout = await startWorkout({ programDayId: ctx.day.id, equipmentProfileId: null, now: NOW });
    await Promise.all([1, 2, 3].map(() => logSet({ workoutId: workout.id, plannedExerciseId: planned.id, exercise, draft: draft() })));
    const sets = await getDb().workout_sets.where("workout_id").equals(workout.id).toArray();
    expect(sets.map((s) => s.set_index).sort()).toEqual([0, 1, 2]);
    expect(sets.every((s) => s.planned_exercise_id === planned.id)).toBe(true);
  });

  it("edits, deletes and restores a set, queueing every change", async () => {
    await onboard();
    const ctx = (await loadToday(null))!.ctx;
    const planned = ctx.planned[0];
    const exercise = library.find((e) => e.id === planned.exercise_id)!;
    const workout = await startWorkout({ programDayId: ctx.day.id, equipmentProfileId: null, now: NOW });
    const set = await logSet({ workoutId: workout.id, plannedExerciseId: planned.id, exercise, draft: draft({ load: 100 }) });

    const edited = await saveSetEdit(set, { reps: 9, load: 105, rir: 1, warmup: false, pain: true, note: " tweak " });
    expect(edited).toMatchObject({ reps: 9, load: 105, rir: 1, pain: true, notes: "tweak", set_index: set.set_index, completed_at: set.completed_at });
    expect(edited.updated_at > set.updated_at).toBe(true);

    await removeSet(set.id);
    expect((await getDb().workout_sets.get(set.id))?.deleted_at).toBeTruthy();
    await restoreSet(edited);
    expect((await getDb().workout_sets.get(set.id))?.deleted_at).toBeNull();
    expect((await getDb().outbox.get(`workout_sets:${set.id}`))?.rev).toBeGreaterThanOrEqual(3);
  });

  it("turning a set into a warmup clears its RIR", async () => {
    await onboard();
    const ctx = (await loadToday(null))!.ctx;
    const planned = ctx.planned[0];
    const exercise = library.find((e) => e.id === planned.exercise_id)!;
    const workout = await startWorkout({ programDayId: ctx.day.id, equipmentProfileId: null, now: NOW });
    const set = await logSet({ workoutId: workout.id, plannedExerciseId: planned.id, exercise, draft: draft() });
    const edited = await saveSetEdit(set, { reps: 8, load: 60, rir: 2, warmup: true, pain: false, note: "" });
    expect(edited).toMatchObject({ is_warmup: true, rir: null });
  });

  it("remembers a swap before any set exists, and reads it back with the workout", async () => {
    await onboard();
    const ctx = (await loadToday(null))!.ctx;
    const workout = await startWorkout({ programDayId: ctx.day.id, equipmentProfileId: null, now: NOW });
    expect(await getSwaps(workout.id)).toEqual({});
    await setSwap(workout.id, ctx.planned[0].id, "ex-a");
    await setSwap(workout.id, ctx.planned[1].id, "ex-b");
    await setSwap(workout.id, ctx.planned[0].id, "ex-c");
    expect(await getSwaps(workout.id)).toEqual({ [ctx.planned[0].id]: "ex-c", [ctx.planned[1].id]: "ex-b" });
    const data = (await loadWorkoutData(workout.id))!;
    expect(data.swaps[ctx.planned[0].id]).toBe("ex-c");
    expect(data.ctx?.day.id).toBe(ctx.day.id);
  });

  it("finds the last finished session for an exercise but not the current one", async () => {
    await onboard();
    const ctx = (await loadToday(null))!.ctx;
    const first = ctx.planned[0];
    const exerciseId = first.exercise_id;
    const w1 = await trainDay(ctx.day.id, 9, NOW);
    expect(await loadLastSession(exerciseId, "other")).toBeNull();
    await finish(w1.id, new Date(NOW.getTime() + 3_600_000));

    const later = new Date(NOW.getTime() + 2 * 86_400_000);
    clock(later);
    const w2 = await startWorkout({ programDayId: ctx.day.id, equipmentProfileId: null, now: later });
    const exercise = library.find((e) => e.id === exerciseId)!;
    await logSet({ workoutId: w2.id, plannedExerciseId: first.id, exercise, draft: draft({ reps: 5 }), now: later });

    const last = (await loadLastSession(exerciseId, w2.id))!;
    expect(last.workout.id).toBe(w1.id);
    expect(last.sets.every((s) => s.reps === 9 && !s.is_warmup)).toBe(true);
    expect(await loadLastSession(exerciseId, w1.id)).toBeNull();
  });
});

describe("history and session detail", () => {
  it("lists finished workouts newest first with set counts and day names", async () => {
    await onboard();
    const ctx = (await loadToday(null))!.ctx;
    const w1 = await trainDay(ctx.day.id, 9, NOW);
    await finish(w1.id, new Date(NOW.getTime() + 3_600_000));
    const next = (await loadToday(null))!.ctx.day;
    const later = new Date(NOW.getTime() + 2 * 86_400_000);
    const w2 = await trainDay(next.id, 9, later);
    await finish(w2.id, new Date(later.getTime() + 3_600_000));
    clock(new Date(later.getTime() + 86_400_000));
    await startWorkout({ programDayId: ctx.day.id, equipmentProfileId: null, now: new Date(later.getTime() + 86_400_000) });

    const history = await loadHistory(10);
    expect(history.total).toBe(2);
    expect(history.rows.map((r) => r.workout.id)).toEqual([w2.id, w1.id]);
    expect(history.rows.map((r) => r.dayName)).toEqual(["Pull", "Push"]);
    expect(history.rows.every((r) => r.workSets > 10)).toBe(true);
    expect((await loadHistory(1)).rows).toHaveLength(1);
    expect((await loadHistory(1)).total).toBe(2);
  });

  it("returns a finished session with its sets and the engine's decisions", async () => {
    await onboard();
    const ctx = (await loadToday(null))!.ctx;
    const workout = await trainDay(ctx.day.id, 10, NOW);
    await finish(workout.id, new Date(NOW.getTime() + 3_600_000), { session_rpe: 7 });

    const session = (await loadSessionData(workout.id))!;
    expect(session.day?.name).toBe("Push");
    expect(session.workout.session_rpe).toBe(7);
    expect(session.sets.length).toBeGreaterThan(10);
    expect(session.decisions.length).toBeGreaterThan(0);
    expect(session.library.length).toBe(library.length);
    expect(session.profile?.display_name).toBe("Levi");
    expect(await loadSessionData("missing")).toBeNull();
    expect(await loadSessionData(null)).toBeNull();
  });

  it("deleting a workout hides it and its sets everywhere", async () => {
    await onboard();
    const ctx = (await loadToday(null))!.ctx;
    const workout = await trainDay(ctx.day.id, 10, NOW);
    await finish(workout.id, new Date(NOW.getTime() + 3_600_000));
    await deleteWorkout(workout.id);

    expect((await loadHistory(10)).total).toBe(0);
    expect(await loadSessionData(workout.id)).toBeNull();
    expect(await getDb().workout_sets.where("workout_id").equals(workout.id).filter((s) => !s.deleted_at).count()).toBe(0);
    expect((await loadToday(null))!.lastCompleted).toBeNull();
  });

  it("an abandoned workout never counts as the last one", async () => {
    await onboard();
    const ctx = (await loadToday(null))!.ctx;
    const workout = await startWorkout({ programDayId: ctx.day.id, equipmentProfileId: null, now: NOW });
    await discardWorkout(workout);
    const today = (await loadToday(null))!;
    expect(today.inProgress).toBeNull();
    expect(today.lastCompleted).toBeNull();
    expect(today.ctx.day.id).toBe(ctx.day.id);
    expect((await loadHistory(10)).total).toBe(0);
  });
});

describe("local-first", () => {
  it("queues every write for sync and never touches the network", async () => {
    const { fakeServer } = await import("@/lib/local/test-support");
    await onboard();
    const ctx = (await loadToday(null))!.ctx;
    await getDb().outbox.clear();
    const workout = await startWorkout({ programDayId: ctx.day.id, equipmentProfileId: null, now: NOW });
    const exercise = library.find((e) => e.id === ctx.planned[0].exercise_id)!;
    const set = await logSet({ workoutId: workout.id, plannedExerciseId: ctx.planned[0].id, exercise, draft: draft() });
    const keys = (await getDb().outbox.toArray()).map((e) => e.key);
    expect(keys).toContain(`workouts:${workout.id}`);
    expect(keys).toContain(`workout_sets:${set.id}`);
    expect(fakeServer.upsertCalls).toHaveLength(0);
  });

  it("keeps sets after the workout row is re-read from storage (resume)", async () => {
    await onboard();
    const ctx = (await loadToday(null))!.ctx;
    const workout = await startWorkout({ programDayId: ctx.day.id, equipmentProfileId: null, now: NOW });
    const exercise = library.find((e) => e.id === ctx.planned[0].exercise_id)!;
    await logSet({ workoutId: workout.id, plannedExerciseId: ctx.planned[0].id, exercise, draft: draft() });
    const resumed = (await loadToday(null))!;
    expect(resumed.inProgress?.id).toBe(workout.id);
    expect((await loadWorkoutData(workout.id))?.workout.status).toBe("in_progress");
    expect(await getDb().workout_sets.where("workout_id").equals(workout.id).count()).toBe(1);
  });
});

describe("no program edge cases", () => {
  it("returns null for a workout that does not exist", async () => {
    expect(await loadWorkoutData("nope")).toBeNull();
    expect(await loadWorkoutData(null)).toBeNull();
  });

  it("returns the workout with no plan context when it has no program day", async () => {
    const orphan = await putRow("workouts" as SyncedTable & "workouts", {
      program_day_id: null,
      equipment_profile_id: null,
      started_at: NOW.toISOString(),
      completed_at: null,
      status: "in_progress",
      session_rpe: null,
      notes: null,
    });
    const data = (await loadWorkoutData(orphan.id))!;
    expect(data.ctx).toBeNull();
  });
});
