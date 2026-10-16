import {
  decision,
  equipmentProfile,
  exercise,
  goal,
  measurement,
  planned,
  profile,
  program,
  programDay,
  recovery,
  set,
  workout,
} from "../analytics/testkit";
import type { ReportData } from "./types";

// One athlete, Denver time (UTC-6 in October). "Now" is Thu Oct 15 2026, 09:00 local.
export const NOW = "2026-10-15T15:00:00.000Z";

export function scenario() {
  const bench = exercise({ name: "Bench Press", primary_muscle: "chest", secondary_muscles: ["front_delts", "triceps"] });
  const pushup = exercise({
    name: "Push-up",
    primary_muscle: "chest",
    secondary_muscles: ["front_delts", "triceps"],
    load_type: "bodyweight",
    equipment: ["bodyweight"],
  });
  const prog = program({ name: "PPL", days_per_week: 3 });
  const push = programDay({ program_id: prog.id, name: "Push A", focus: "push", position: 0 });
  const pull = programDay({ program_id: prog.id, name: "Pull A", focus: "pull", position: 1 });
  const peBench = planned({ program_day_id: push.id, exercise_id: bench.id, sets: 3, rep_min: 6, rep_max: 10, target_rir: 2, load: 110 });

  const wPrev = workout({ program_day_id: push.id, started_at: "2026-10-05T23:00:00.000Z", completed_at: "2026-10-06T00:40:00.000Z" });
  const w1 = workout({
    program_day_id: push.id,
    started_at: "2026-10-12T23:00:00.000Z",
    completed_at: "2026-10-12T23:50:00.000Z",
    session_rpe: 7,
  });
  const wAbandoned = workout({ program_day_id: push.id, started_at: "2026-10-13T23:00:00.000Z", status: "abandoned" });
  const w2 = workout({
    program_day_id: push.id,
    started_at: "2026-10-15T02:00:00.000Z", // Oct 14, 20:00 local
    completed_at: "2026-10-15T02:55:00.000Z",
    session_rpe: 8,
    notes: "Left shoulder tight on the last rep",
  });

  const b = (w: { id: string }, o: Partial<Parameters<typeof set>[0]>) =>
    set({ workout_id: w.id, exercise_id: bench.id, planned_exercise_id: peBench.id, ...o });
  const p = (w: { id: string }, o: Partial<Parameters<typeof set>[0]>) => set({ workout_id: w.id, exercise_id: pushup.id, ...o });

  const data: ReportData = {
    profile: profile({ timezone: "America/Denver", display_name: "Levi" }),
    goals: [goal()],
    equipment_profiles: [equipmentProfile()],
    program: prog,
    program_days: [push, pull],
    planned_exercises: [peBench],
    exercises: [bench, pushup],
    workouts: [wPrev, w1, wAbandoned, w2],
    workout_sets: [
      b(wPrev, { set_index: 0, load: 100, reps: 8, rir: 2 }),
      b(wPrev, { set_index: 1, load: 100, reps: 8, rir: 2 }),
      b(wPrev, { set_index: 2, load: 100, reps: 8, rir: 2 }),
      b(w1, { set_index: 0, load: 60, reps: 10, is_warmup: true }),
      b(w1, { set_index: 1, load: 105, reps: 8, rir: 2 }),
      b(w1, { set_index: 2, load: 105, reps: 7, rir: 1 }),
      b(wAbandoned, { set_index: 0, load: 300, reps: 8, rir: 0 }),
      b(w2, { set_index: 0, load: 110, reps: 8, rir: 3 }),
      b(w2, { set_index: 1, load: 110, reps: 6, rir: 0, pain: true }),
      p(w2, { set_index: 2, reps: 15 }),
      p(w2, { set_index: 3, reps: 12 }),
      p(w2, { set_index: 4, reps: 10 }),
    ],
    recovery_logs: [
      recovery({ date: "2026-10-12", sleep_hours: 7, sleep_quality: 4, soreness: 2, energy: 4, stress: 2 }),
      recovery({ date: "2026-10-13", sleep_hours: 5.5, sleep_quality: 3, soreness: 4, energy: 3, stress: 3 }),
      recovery({ date: "2026-10-14", sleep_hours: 8, sleep_quality: 5, soreness: 3, energy: 5, stress: 1 }),
    ],
    body_measurements: [
      measurement({ measured_on: "2026-10-01", bodyweight: 180 }),
      measurement({ measured_on: "2026-10-08", bodyweight: 181 }),
      measurement({ measured_on: "2026-10-15", bodyweight: 182 }),
    ],
    progression_decisions: [
      decision({
        planned_exercise_id: peBench.id,
        workout_id: wPrev.id,
        decided_at: "2026-10-06T00:41:00.000Z",
        action: "increase_load",
        before: { exercise_id: bench.id, sets: 3, rep_min: 6, rep_max: 10, target_rir: 2, load: 100 },
        after: { exercise_id: bench.id, sets: 3, rep_min: 6, rep_max: 10, target_rir: 2, load: 105 },
        reason: "Every set reached 8 reps with reps in reserve.",
      }),
      decision({
        planned_exercise_id: peBench.id,
        workout_id: w1.id,
        decided_at: "2026-10-12T23:51:00.000Z",
        action: "hold",
        before: { exercise_id: bench.id, sets: 3, rep_min: 6, rep_max: 10, target_rir: 2, load: 105 },
        after: { exercise_id: bench.id, sets: 3, rep_min: 6, rep_max: 10, target_rir: 2, load: 105 },
        reason: "The second set fell short of 8 reps.",
      }),
      decision({
        planned_exercise_id: peBench.id,
        workout_id: w2.id,
        decided_at: "2026-10-15T02:56:00.000Z",
        action: "pain_hold",
        before: { exercise_id: bench.id, sets: 3, rep_min: 6, rep_max: 10, target_rir: 2, load: 110 },
        after: { exercise_id: bench.id, sets: 3, rep_min: 6, rep_max: 10, target_rir: 2, load: 110 },
        reason: "A set was flagged with pain, so the load stays at 110.",
      }),
    ],
  };

  return { data, bench, pushup, prog, push, pull, peBench, wPrev, w1, wAbandoned, w2 };
}

export const emptyData = (): ReportData => ({
  profile: null,
  goals: [],
  equipment_profiles: [],
  program: null,
  program_days: [],
  planned_exercises: [],
  exercises: [],
  workouts: [],
  workout_sets: [],
  recovery_logs: [],
  body_measurements: [],
  progression_decisions: [],
});
