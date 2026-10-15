// Test support only: drives the same code paths the screens use (onboarding, planning,
// logging, finishing) against a local database, with a clock that moves with the sessions.
import { vi } from "vitest";
import type { Exercise } from "@/lib/domain/types";
import { completeWorkout } from "@/lib/local/complete-workout";
import { emptyDraft, saveOnboarding, type OnboardingDraft } from "./onboarding-model";
import { buildPlan, loadPlanContext, resolveEquipment } from "./queries";
import { logSet, startWorkout } from "./session-actions";
import { initialDraft, type SetDraft } from "./workout-model";

export const NOW = new Date("2026-10-15T15:00:00.000Z");

// The engine compares a plan's updated_at with when the last session finished, so the
// clock has to move with the sessions or every plan would look newer than its history.
export const clock = (at: Date) => vi.setSystemTime(at);

export const draft = (over: Partial<SetDraft> = {}): SetDraft => ({
  reps: 8,
  load: 100,
  rir: 2,
  warmup: false,
  pain: false,
  note: "",
  ...over,
});

export async function onboard(library: Exercise[], extra: Partial<OnboardingDraft> = {}) {
  await saveOnboarding(
    {
      ...emptyDraft(null),
      name: "Levi",
      bodyweight: 180,
      atGym: true,
      main: "gym",
      homeEquipment: ["pullup_bar", "dumbbells", "bands", "bench"],
      ...extra,
    },
    library,
    NOW,
  );
}

export async function finish(workoutId: string, at: Date, options: { session_rpe?: number } = {}) {
  clock(at);
  return completeWorkout(workoutId, { now: at, ...options });
}

/** Logs every planned set of a day at the given reps, using the plan the lifter would see. */
export async function trainDay(dayId: string, reps: number, at: Date) {
  const ctx = (await loadPlanContext(dayId))!;
  const equipment = resolveEquipment(ctx, null);
  const plan = buildPlan(ctx, equipment, at.toISOString());
  clock(at);
  const workout = await startWorkout({ programDayId: dayId, equipmentProfileId: equipment?.id ?? null, now: at });
  clock(new Date(at.getTime() + 60_000));
  for (const item of plan) {
    for (let i = 0; i < item.prescription.sets; i++) {
      const d = initialDraft({
        prescription: item.prescription,
        targetReps: typeof item.decision.inputs.target_reps === "number" ? item.decision.inputs.target_reps : null,
        exercise: item.exercise,
        planExerciseId: item.exercise.id,
        logged: [],
        last: null,
      });
      await logSet({
        workoutId: workout.id,
        plannedExerciseId: item.planned.id,
        exercise: item.exercise,
        draft: { ...d, reps, load: d.load ?? (item.exercise.load_type === "external" ? 20 : null) },
        now: new Date(at.getTime() + 60_000),
      });
    }
  }
  return workout;
}
