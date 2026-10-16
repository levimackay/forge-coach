import type { Exercise, PrescriptionSnapshot, Unit, WorkoutSet } from "@/lib/domain/types";
import { formatLoad, formatNumber } from "./format";

export const DEFAULT_REST_SECONDS = 90;
export const WARMUP_REST_SECONDS = 60;

export interface SetDraft {
  reps: number | null;
  load: number | null;
  rir: number | null;
  warmup: boolean;
  pain: boolean;
  note: string;
}

type LoadKind = Pick<Exercise, "load_type">;

/** Bodyweight work has no number to enter; external and assisted work do. */
export const usesLoad = (exercise: LoadKind): boolean => exercise.load_type !== "bodyweight";

export const loadLabel = (exercise: LoadKind): string => (exercise.load_type === "assisted" ? "Assistance" : "Weight");

const live = <T extends { deleted_at?: string | null }>(rows: T[]): T[] => rows.filter((r) => !r.deleted_at);

const bySetOrder = (a: WorkoutSet, b: WorkoutSet): number =>
  a.set_index - b.set_index || a.completed_at.localeCompare(b.completed_at);

/** Next position for a new set of one planned exercise. Gaps left by deletes are fine. */
export function nextSetIndex(sets: Pick<WorkoutSet, "set_index" | "deleted_at">[]): number {
  const indexes = live(sets).map((s) => s.set_index);
  return indexes.length ? Math.max(...indexes) + 1 : 0;
}

export const workSetsOf = (sets: WorkoutSet[]): WorkoutSet[] => live(sets).filter((s) => !s.is_warmup);

/** A workout's sets grouped by planned exercise, each group in the order they were done. */
export function groupByPlanned(sets: WorkoutSet[]): Map<string, WorkoutSet[]> {
  const groups = new Map<string, WorkoutSet[]>();
  for (const s of live(sets)) {
    const key = s.planned_exercise_id ?? "";
    const list = groups.get(key);
    if (list) list.push(s);
    else groups.set(key, [s]);
  }
  for (const list of groups.values()) list.sort(bySetOrder);
  return groups;
}

/**
 * The exercise being done in a planned slot. A swap the lifter chose wins; otherwise
 * whatever the newest logged set used; otherwise the plan's own pick.
 */
export function currentExerciseId(args: {
  planExerciseId: string;
  swappedTo: string | undefined;
  sets: WorkoutSet[];
}): string {
  if (args.swappedTo) return args.swappedTo;
  const newest = [...live(args.sets)].sort((a, b) => b.completed_at.localeCompare(a.completed_at) || b.set_index - a.set_index)[0];
  return newest?.exercise_id ?? args.planExerciseId;
}

export interface DraftArgs {
  prescription: Pick<PrescriptionSnapshot, "rep_min" | "target_rir" | "load">;
  /** The engine's per-set rep goal for this session, when it has one. */
  targetReps: number | null;
  exercise: Exercise;
  /** The exercise the plan itself calls for. A different `exercise` means the lifter swapped. */
  planExerciseId: string;
  /** Sets already logged this session for this planned exercise. */
  logged: WorkoutSet[];
  /** The last finished session that included `exercise`. */
  last: { sets: Pick<WorkoutSet, "reps" | "load">[] } | null;
}

/** What the entry form starts with: the previous set today, else the prescription, else last time. */
export function initialDraft(args: DraftArgs): SetDraft {
  const { prescription, exercise } = args;
  const base = { warmup: false, pain: false, note: "" };
  const previous = [...workSetsOf(args.logged).filter((s) => s.exercise_id === exercise.id)].sort(bySetOrder).at(-1);
  if (previous) {
    return {
      ...base,
      reps: previous.reps,
      load: usesLoad(exercise) ? previous.load : null,
      rir: previous.rir ?? prescription.target_rir,
    };
  }
  if (exercise.id === args.planExerciseId) {
    return {
      ...base,
      reps: args.targetReps ?? prescription.rep_min,
      load: usesLoad(exercise) ? prescription.load : null,
      rir: prescription.target_rir,
    };
  }
  const first = args.last?.sets[0];
  return {
    ...base,
    reps: first?.reps ?? exercise.default_rep_min,
    load: usesLoad(exercise) ? (first?.load ?? null) : null,
    rir: prescription.target_rir,
  };
}

/** External work needs a weight before it can be logged; everything needs reps. */
export function canLog(draft: SetDraft, exercise: LoadKind): boolean {
  if (draft.reps === null || draft.reps < 1) return false;
  return exercise.load_type !== "external" || draft.load !== null;
}

export function draftToRow(args: {
  draft: SetDraft;
  exercise: LoadKind & Pick<Exercise, "id">;
  workoutId: string;
  plannedExerciseId: string | null;
  setIndex: number;
  completedAt: string;
}): Omit<WorkoutSet, "id" | "user_id" | "created_at" | "updated_at" | "server_updated_at" | "deleted_at"> {
  const { draft, exercise } = args;
  const note = draft.note.trim();
  return {
    workout_id: args.workoutId,
    planned_exercise_id: args.plannedExerciseId,
    exercise_id: exercise.id,
    set_index: args.setIndex,
    reps: draft.reps ?? 0,
    load: usesLoad(exercise) ? draft.load : null,
    // Effort ratings on warmups would only pollute the engine's view of the work sets.
    rir: draft.warmup ? null : draft.rir,
    is_warmup: draft.warmup,
    pain: draft.pain,
    completed_at: args.completedAt,
    notes: note === "" ? null : note,
  };
}

/** "12 reps at 50 lb, 2 RIR". Read aloud, so it spells everything out. */
export function describeSet(set: Pick<WorkoutSet, "reps" | "load" | "rir">, unit: Unit): string {
  const parts = [`${set.reps} ${set.reps === 1 ? "rep" : "reps"}`];
  if (set.load !== null) parts[0] += ` at ${formatLoad(set.load, unit)}`;
  if (set.rir !== null) parts.push(`${set.rir} RIR`);
  return parts.join(", ");
}

const repsOf = (reps: number): string => `${reps} ${reps === 1 ? "rep" : "reps"}`;

/** "160 lb × 6 at 2 RIR", or "12 reps at 2 RIR" when there is no weight. The on-screen form of a logged set. */
export function setLine(set: Pick<WorkoutSet, "reps" | "load" | "rir">, unit: Unit): string {
  const lift = set.load !== null ? `${formatLoad(set.load, unit)} × ${set.reps}` : repsOf(set.reps);
  return set.rir !== null ? `${lift} at ${set.rir} RIR` : lift;
}

/** "160 lb × 6, 6, 6" for a shared weight, "160 lb × 6, 165 lb × 5" for changing ones, "12, 11 reps" with no weight. */
export function lastSessionLine(sets: Pick<WorkoutSet, "reps" | "load">[], unit: Unit): string {
  if (sets.length === 0) return "";
  const loads = new Set(sets.map((s) => s.load));
  if (loads.size === 1) {
    const load = sets[0].load;
    const reps = sets.map((s) => s.reps).join(", ");
    return load !== null ? `${formatLoad(load, unit)} × ${reps}` : `${reps} reps`;
  }
  return sets.map((s) => (s.load !== null ? `${formatLoad(s.load, unit)} × ${s.reps}` : `${s.reps}`)).join(", ");
}

/** What the Log set band shows on its right: "160 × 6, 2 RIR". No unit, because the weight row beside it has one. */
export function draftSummary(draft: SetDraft, exercise: LoadKind): string {
  const reps = draft.reps ?? 0;
  const lift = usesLoad(exercise) && draft.load !== null ? `${formatNumber(draft.load)} × ${reps}` : repsOf(reps);
  return !draft.warmup && draft.rir !== null ? `${lift}, ${draft.rir} RIR` : lift;
}

export function restSecondsFor(planned: { rest_seconds: number | null }, warmup: boolean): number {
  return warmup ? WARMUP_REST_SECONDS : (planned.rest_seconds ?? DEFAULT_REST_SECONDS);
}

/** Index of the first slot that still has sets to do, or -1 when everything is done. */
export function firstOpenIndex(slots: { workSets: number; target: number }[]): number {
  return slots.findIndex((s) => s.workSets < s.target);
}

export interface SessionTotals {
  exercises: number;
  workSets: number;
}

export function sessionTotals(sets: WorkoutSet[]): SessionTotals {
  const work = workSetsOf(sets);
  return {
    exercises: new Set(work.map((s) => s.planned_exercise_id ?? s.exercise_id)).size,
    workSets: work.length,
  };
}

export function minutesBetween(startIso: string, endMs: number): number {
  return Math.max(0, Math.round((endMs - Date.parse(startIso)) / 60_000));
}
