import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Exercise, PlannedExercise, Workout } from "@/lib/domain/types";
import { completeWorkout } from "./complete-workout";
import { getDb } from "./db";
import { fakeServer, freshLocalState } from "./test-support";
import { putRow, putRows } from "./write";

vi.mock("@/lib/supabase/client", async () => {
  const { fakeServer } = await import("./test-support");
  return { getSupabase: () => fakeServer.client };
});

const exerciseInput = (slug: string, name: string): Omit<Exercise, "id" | "user_id" | "created_at" | "updated_at" | "deleted_at"> => ({
  slug,
  name,
  primary_muscle: "chest",
  secondary_muscles: ["triceps"],
  movement_pattern: "horizontal_push",
  equipment: ["barbell", "bench"],
  load_type: "external",
  progression_group: null,
  ladder_level: null,
  default_rep_min: 6,
  default_rep_max: 10,
  default_increment: 5,
  notes: null,
});

async function seedProgram(programCreatedAt = "2026-08-01T00:00:00.000Z") {
  const bench = await putRow("exercises", exerciseInput("bench-press", "Bench press"));
  const fly = await putRow("exercises", exerciseInput("cable-fly", "Cable fly"));
  const program = await putRow("programs", {
    created_at: programCreatedAt,
    name: "PPL",
    split: "ppl",
    days_per_week: 3,
    is_active: true,
    version: 1,
    notes: null,
  });
  const day = await putRow("program_days", {
    program_id: program.id,
    position: 0,
    name: "Push",
    focus: "push",
    equipment_profile_id: null,
  });
  const [benchPlan, flyPlan] = await putRows("planned_exercises", [
    {
      program_day_id: day.id,
      position: 0,
      exercise_id: bench.id,
      sets: 3,
      rep_min: 6,
      rep_max: 10,
      target_rir: 2,
      load: 135,
      rest_seconds: 120,
      notes: null,
      is_active: true,
    },
    {
      program_day_id: day.id,
      position: 1,
      exercise_id: fly.id,
      sets: 3,
      rep_min: 10,
      rep_max: 15,
      target_rir: 2,
      load: 30,
      rest_seconds: 90,
      notes: null,
      is_active: true,
    },
  ]);
  const workout = await putRow("workouts", {
    program_day_id: day.id,
    equipment_profile_id: null,
    started_at: "2026-10-15T17:00:00.000Z",
    completed_at: null,
    status: "in_progress",
    session_rpe: null,
    notes: null,
  });
  return { bench, fly, program, day, benchPlan, flyPlan, workout };
}

async function logSets(workout: Workout, plan: PlannedExercise, reps: number, load: number | null, count = 3) {
  await putRows(
    "workout_sets",
    Array.from({ length: count }, (_, i) => ({
      workout_id: workout.id,
      planned_exercise_id: plan.id,
      exercise_id: plan.exercise_id,
      set_index: i,
      reps,
      load,
      rir: 2,
      is_warmup: false,
      pain: false,
      completed_at: `2026-10-15T17:${10 + i}:00.000Z`,
      notes: null,
    })),
  );
}

const NOW = new Date("2026-10-15T18:00:00.000Z");

beforeEach(async () => {
  await freshLocalState();
});

describe("completeWorkout", () => {
  it("completes the workout and records engine decisions without any network", async () => {
    const { workout, benchPlan } = await seedProgram();
    await logSets(workout, benchPlan, 10, 135);

    const result = await completeWorkout(workout.id, { now: NOW, session_rpe: 8 });

    expect(fakeServer.upsertCalls).toHaveLength(0);
    expect(result.workout.status).toBe("completed");
    expect(result.workout.completed_at).toBe(NOW.toISOString());
    expect(result.workout.session_rpe).toBe(8);
    expect(result.decisions).toHaveLength(1);

    const [decision] = result.decisions;
    expect(decision.planned_exercise_id).toBe(benchPlan.id);
    expect(decision.workout_id).toBe(workout.id);
    expect(decision.decided_at).toBe(NOW.toISOString());
    expect(decision.before.load).toBe(135);
    expect(decision.reason.length).toBeGreaterThan(10);

    const stored = await getDb().progression_decisions.toArray();
    expect(stored).toHaveLength(1);
    const plan = await getDb().planned_exercises.get(benchPlan.id);
    expect(plan?.load).toBe(decision.after.load);
    expect(plan?.rep_max).toBe(decision.after.rep_max);
  });

  it("queues every write for sync", async () => {
    const { workout, benchPlan } = await seedProgram();
    await logSets(workout, benchPlan, 10, 135);
    await getDb().outbox.clear();

    const result = await completeWorkout(workout.id, { now: NOW });

    const keys = (await getDb().outbox.toArray()).map((e) => e.key);
    expect(keys).toContain(`workouts:${workout.id}`);
    expect(keys).toContain(`progression_decisions:${result.decisions[0].id}`);
  });

  it("only decides for exercises that were trained", async () => {
    const { workout, benchPlan, flyPlan } = await seedProgram();
    await logSets(workout, benchPlan, 8, 135);

    const result = await completeWorkout(workout.id, { now: NOW });

    expect(result.decisions.map((d) => d.planned_exercise_id)).toEqual([benchPlan.id]);
    const untouched = await getDb().planned_exercises.get(flyPlan.id);
    expect(untouched?.load).toBe(30);
  });

  it("is idempotent: finishing twice does not decide twice", async () => {
    const { workout, benchPlan } = await seedProgram();
    await logSets(workout, benchPlan, 10, 135);

    const first = await completeWorkout(workout.id, { now: NOW });
    const second = await completeWorkout(workout.id, { now: new Date("2026-10-15T18:05:00.000Z") });

    expect(second.decisions.map((d) => d.id)).toEqual(first.decisions.map((d) => d.id));
    expect(await getDb().progression_decisions.count()).toBe(1);
    expect(second.workout.completed_at).toBe(NOW.toISOString());
  });

  it("completes a workout that has no program day without deciding anything", async () => {
    await seedProgram();
    const free = await putRow("workouts", {
      program_day_id: null,
      equipment_profile_id: null,
      started_at: "2026-10-15T17:00:00.000Z",
      completed_at: null,
      status: "in_progress",
      session_rpe: null,
      notes: null,
    });
    const result = await completeWorkout(free.id, { now: NOW });
    expect(result.workout.status).toBe("completed");
    expect(result.decisions).toEqual([]);
  });

  // Finishing an hour after the rows were written, so the plan is older than the session it judges.
  const later = () => new Date(Date.now() + 3_600_000);

  it("lets the first session of a brand-new program progress instead of calling it low adherence", async () => {
    const now = later();
    const { workout, benchPlan } = await seedProgram(new Date(now.getTime() - 2 * 3_600_000).toISOString());
    await logSets(workout, benchPlan, 10, 135);

    const [decision] = (await completeWorkout(workout.id, { now })).decisions;
    expect(decision.action).toBe("increase_load");
    expect(decision.after.load).toBe(140);
    expect(decision.inputs.planned_last_28d).toBe(0);
  });

  it("still holds for low adherence on a program old enough to judge", async () => {
    const now = later();
    const { workout, benchPlan } = await seedProgram(new Date(now.getTime() - 60 * 86_400_000).toISOString());
    await logSets(workout, benchPlan, 10, 135);

    const [decision] = (await completeWorkout(workout.id, { now })).decisions;
    expect(decision.action).toBe("hold");
    expect(decision.inputs.rule).toBe("ceiling_low_adherence");
    expect(decision.inputs.planned_last_28d).toBe(12);
  });

  it("makes no decision for an exercise that only had warmups", async () => {
    const { workout, benchPlan } = await seedProgram();
    await putRow("workout_sets", {
      workout_id: workout.id,
      planned_exercise_id: benchPlan.id,
      exercise_id: benchPlan.exercise_id,
      set_index: 0,
      reps: 8,
      load: 95,
      rir: null,
      is_warmup: true,
      pain: true,
      completed_at: "2026-10-15T17:05:00.000Z",
      notes: null,
    });

    const result = await completeWorkout(workout.id, { now: NOW });
    expect(result.decisions).toEqual([]);
    expect((await getDb().planned_exercises.get(benchPlan.id))?.load).toBe(135);
  });

  it("rejects an unknown workout", async () => {
    await expect(completeWorkout(crypto.randomUUID())).rejects.toThrow(/not found/i);
  });
});
