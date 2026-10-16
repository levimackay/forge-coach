import type { Exercise, PrescriptionSnapshot, ProgressionDecision, Unit, WorkoutSet } from "@/lib/domain/types";
import { formatLoad, formatRepRange } from "./format";

export interface SessionGroup {
  key: string;
  exerciseId: string;
  name: string;
  sets: { set: WorkoutSet; label: string }[];
}

/**
 * A finished workout's sets by exercise, in the order the exercises were started.
 * A planned exercise that was swapped part way through shows as two groups.
 */
export function groupSessionSets(sets: WorkoutSet[], nameOf: (exerciseId: string) => string): SessionGroup[] {
  const ordered = sets
    .filter((s) => !s.deleted_at)
    .sort((a, b) => a.completed_at.localeCompare(b.completed_at) || a.set_index - b.set_index);
  const groups = new Map<string, SessionGroup>();
  for (const set of ordered) {
    const key = `${set.planned_exercise_id ?? "none"}:${set.exercise_id}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, exerciseId: set.exercise_id, name: nameOf(set.exercise_id), sets: [] };
      groups.set(key, group);
    }
    const workBefore = group.sets.filter((s) => !s.set.is_warmup).length;
    group.sets.push({ set, label: set.is_warmup ? "Warmup" : `Set ${workBefore + 1}` });
  }
  return [...groups.values()];
}

/**
 * What a decision changes for next time, one short line per field that moved. Empty when nothing
 * did, and for an equipment substitute, which applied to that session only and never changes the plan.
 */
export function nextTimeChanges(
  decision: Pick<ProgressionDecision, "action" | "before" | "after">,
  unit: Unit,
  nameOf: (exerciseId: string) => string,
): string[] {
  if (decision.action === "substitute_equipment") return [];
  return describeChange(decision.before, decision.after, unit, nameOf);
}

/** What a decision changed, one short line per field that moved. Empty when nothing did. */
export function describeChange(
  before: PrescriptionSnapshot,
  after: PrescriptionSnapshot,
  unit: Unit,
  nameOf: (exerciseId: string) => string,
): string[] {
  const lines: string[] = [];
  if (before.exercise_id !== after.exercise_id) {
    lines.push(`Exercise: ${nameOf(after.exercise_id)} (was ${nameOf(before.exercise_id)})`);
  }
  if (before.load !== after.load) {
    const was = before.load === null ? "no weight set" : formatLoad(before.load, unit);
    lines.push(after.load === null ? `Weight: choose a new one (was ${was})` : `Weight: ${formatLoad(after.load, unit)} (was ${was})`);
  }
  if (before.sets !== after.sets) lines.push(`Sets: ${after.sets} (was ${before.sets})`);
  if (before.rep_min !== after.rep_min || before.rep_max !== after.rep_max) {
    lines.push(
      `Rep range: ${formatRepRange(after.rep_min, after.rep_max)} (was ${formatRepRange(before.rep_min, before.rep_max)})`,
    );
  }
  if (before.target_rir !== after.target_rir) lines.push(`Reps left in the tank: ${after.target_rir} (was ${before.target_rir})`);
  return lines;
}

export function nameLookup(library: Pick<Exercise, "id" | "name">[]): (id: string) => string {
  const names = new Map(library.map((e) => [e.id, e.name]));
  return (id) => names.get(id) ?? "Exercise";
}
