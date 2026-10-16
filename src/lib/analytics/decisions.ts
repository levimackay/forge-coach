import type {
  Exercise,
  IsoDate,
  IsoDateTime,
  PrescriptionSnapshot,
  ProgressionAction,
  ProgressionDecision,
  Uuid,
} from "@/lib/domain/types";
import { inRange, localDate, time } from "./dates";

export const DEFAULT_DECISION_LIMIT = 20;

/**
 * What a session's decision says was prescribed for the exercise actually performed. `before`
 * is the plan the session started from; an equipment substitute was prescribed as `after`.
 * When the lifter swapped to some other exercise mid-session, nothing was prescribed for it.
 */
export function prescribedThatDay(
  decision: Pick<ProgressionDecision, "action" | "before" | "after">,
  exerciseId: Uuid,
): PrescriptionSnapshot | null {
  if (decision.before.exercise_id === exerciseId) return decision.before;
  if (decision.action === "substitute_equipment" && decision.after.exercise_id === exerciseId) return decision.after;
  return null;
}

export interface DecisionItem {
  decided_at: IsoDateTime;
  workout_id: Uuid | null;
  exercise_id: Uuid;
  exercise: string;
  /** Name of the exercise before the change, when the decision swapped the variation. */
  from_exercise: string | null;
  action: ProgressionAction;
  before: PrescriptionSnapshot;
  after: PrescriptionSnapshot;
  reason: string;
}

export interface DecisionDigest {
  /** Every matching decision, not just the ones listed. */
  total: number;
  by_action: Partial<Record<ProgressionAction, number>>;
  /** Newest first, capped at `limit`. */
  items: DecisionItem[];
}

/** Engine decisions in a date window, or the ones made after one workout. */
export function decisionDigest(input: {
  decisions: ProgressionDecision[];
  exercises: Exercise[];
  timeZone: string;
  from?: IsoDate;
  to?: IsoDate;
  workoutId?: Uuid;
  limit?: number;
}): DecisionDigest {
  const names = new Map(input.exercises.map((e) => [e.id, e.name]));
  const matching = input.decisions
    .filter((d) => {
      if (d.deleted_at) return false;
      if (input.workoutId) return d.workout_id === input.workoutId;
      if (input.from && input.to) return inRange(localDate(d.decided_at, input.timeZone), input.from, input.to);
      return true;
    })
    .sort((a, b) => time(b.decided_at) - time(a.decided_at));

  const by_action: Partial<Record<ProgressionAction, number>> = {};
  for (const d of matching) by_action[d.action] = (by_action[d.action] ?? 0) + 1;

  return {
    total: matching.length,
    by_action,
    items: matching.slice(0, input.limit ?? DEFAULT_DECISION_LIMIT).map((d) => ({
      decided_at: d.decided_at,
      workout_id: d.workout_id,
      exercise_id: d.after.exercise_id,
      exercise: names.get(d.after.exercise_id) ?? "Unknown exercise",
      from_exercise:
        d.before.exercise_id === d.after.exercise_id ? null : (names.get(d.before.exercise_id) ?? "Unknown exercise"),
      action: d.action,
      before: d.before,
      after: d.after,
      reason: d.reason,
    })),
  };
}
