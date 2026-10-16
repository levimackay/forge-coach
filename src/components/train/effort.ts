import { MAX_RIR } from "./program-actions";

export type Effort = "easy" | "good" | "hard";

export const EFFORTS: readonly Effort[] = ["easy", "good", "hard"];

export const EFFORT_LABEL: Record<Effort, string> = { easy: "Easy", good: "Good", hard: "Hard" };

/**
 * What each word writes to workout_sets.rir, given the plan's target. The engine holds the weight
 * when a set ends more than its tolerance (1) below the target, so:
 *   good  the target itself, which the engine treats as on plan
 *   hard  0, a set taken to or next to failure, which the engine treats as too hard for a plan that
 *         asks for 2 or more in reserve
 *   easy  two above the target, clearly easier than planned
 */
export const EFFORT_RIR: Record<Effort, (targetRir: number) => number> = {
  easy: (target) => Math.min(target + 2, MAX_RIR),
  good: (target) => target,
  hard: () => 0,
};

/** The word closest to a stored RIR, for showing a logged set. A tie goes to Good. */
export function effortForRir(rir: number, targetRir: number): Effort {
  let best: Effort = "good";
  for (const effort of ["easy", "hard"] as const) {
    if (Math.abs(EFFORT_RIR[effort](targetRir) - rir) < Math.abs(EFFORT_RIR[best](targetRir) - rir)) best = effort;
  }
  return best;
}

/** How hard the whole session felt, on the 1 to 10 scale workouts.session_rpe stores. */
export const SESSION_RPE: Record<Effort, number> = { easy: 6, good: 8, hard: 9 };
