import type {
  EquipmentProfile,
  Exercise,
  InverseChange,
  PlannedExercise,
  ProgramDay,
  ProposalChange,
  Unit,
  Uuid,
} from "@/lib/domain/types";
import { loadText, repRangeText, restText, sentence } from "./format";

export interface DiffRow {
  label: string;
  /** What it is now. Null when there is no baseline to compare with (history entries). */
  before: string | null;
  after: string;
}

export interface DiffBlock {
  key: string;
  /** Short verb shown before the title, e.g. "Change", "Swap". */
  verb: "Change" | "Swap" | "Add" | "Remove" | "Update";
  title: string;
  /** Where it happens, e.g. "Push A". */
  place: string | null;
  rows: DiffRow[];
  /** Something the reader should know before trusting this change. */
  warning: string | null;
}

export interface DiffContext {
  planned: ReadonlyMap<Uuid, PlannedExercise>;
  days: ReadonlyMap<Uuid, ProgramDay>;
  exercises: ReadonlyMap<Uuid, Exercise>;
  equipment: ReadonlyMap<Uuid, EquipmentProfile>;
  unit: Unit;
}

/**
 * pending: compare with the program as it is now.
 * applied: the program already has the change, so "before" comes from the stored inverse.
 * record: no reliable baseline (rejected or undone), so only the proposed values are listed.
 */
export type DiffMode = "pending" | "applied" | "record";

const MISSING_EXERCISE = "an exercise that is no longer in your library";
const NOT_IN_PROGRAM = "This exercise is not in your current program, so the change may not apply.";

const nameOf = (ctx: DiffContext, id: Uuid): string => ctx.exercises.get(id)?.name ?? MISSING_EXERCISE;

function loadDisplay(ctx: DiffContext, exerciseId: Uuid, load: number | null): string {
  if (load !== null) return loadText(load, ctx.unit);
  return ctx.exercises.get(exerciseId)?.load_type === "bodyweight" ? "Bodyweight" : "Not set";
}

type Prescription = Pick<PlannedExercise, "sets" | "rep_min" | "rep_max" | "target_rir" | "load"> & {
  rest_seconds?: number | null;
  notes?: string | null;
};

/** The rows that differ between two prescriptions, or all of `after` when there is no `before`. */
export function prescriptionRows(
  ctx: DiffContext,
  before: Prescription | null,
  patch: Partial<Prescription>,
  exerciseId: Uuid,
): DiffRow[] {
  const rows: DiffRow[] = [];
  const push = (label: string, b: string | null, a: string) => {
    if (b === null || b !== a) rows.push({ label, before: b, after: a });
  };

  if (patch.sets !== undefined) push("Sets", before ? String(before.sets) : null, String(patch.sets));

  if (patch.rep_min !== undefined || patch.rep_max !== undefined) {
    const min = patch.rep_min ?? before?.rep_min;
    const max = patch.rep_max ?? before?.rep_max;
    if (min !== undefined && max !== undefined) {
      push("Reps", before ? repRangeText(before.rep_min, before.rep_max) : null, repRangeText(min, max));
    } else {
      // A one-sided change to a row we cannot see: say which bound moves.
      if (patch.rep_min !== undefined) push("Lowest reps", null, String(patch.rep_min));
      if (patch.rep_max !== undefined) push("Highest reps", null, String(patch.rep_max));
    }
  }

  if (patch.target_rir !== undefined) {
    push("Reps left", before ? String(before.target_rir) : null, String(patch.target_rir));
  }
  if (patch.load !== undefined) {
    push("Load", before ? loadDisplay(ctx, exerciseId, before.load) : null, loadDisplay(ctx, exerciseId, patch.load));
  }
  if (patch.rest_seconds !== undefined) {
    push("Rest", before ? restText(before.rest_seconds ?? null) : null, restText(patch.rest_seconds));
  }
  if (patch.notes !== undefined) {
    push("Notes", before ? before.notes || "None" : null, patch.notes || "None");
  }
  return rows;
}

function dayName(ctx: DiffContext, id: Uuid | undefined): string | null {
  return (id && ctx.days.get(id)?.name) || null;
}

/** The planned row as it was before an applied change, rebuilt from the stored inverse operations. */
function priorPlanned(current: PlannedExercise, inverse: readonly InverseChange[] | null): PlannedExercise {
  let row = current;
  for (const inv of inverse ?? []) {
    if (!("planned_exercise_id" in inv) || inv.planned_exercise_id !== current.id) continue;
    if (inv.op === "update_prescription") row = { ...row, ...inv.set };
    else if (inv.op === "swap_exercise") row = { ...row, exercise_id: inv.exercise_id };
  }
  return row;
}

function priorDay(current: ProgramDay, inverse: readonly InverseChange[] | null): ProgramDay {
  let row = current;
  for (const inv of inverse ?? []) {
    if (inv.op === "update_day" && inv.program_day_id === current.id) row = { ...row, ...inv.set };
  }
  return row;
}

function describeOne(
  change: ProposalChange,
  index: number,
  ctx: DiffContext,
  mode: DiffMode,
  inverse: readonly InverseChange[] | null,
): DiffBlock {
  const key = `${index}-${change.op}`;

  switch (change.op) {
    case "update_prescription": {
      const current = ctx.planned.get(change.planned_exercise_id);
      const base = current ? (mode === "applied" ? priorPlanned(current, inverse) : current) : null;
      const exerciseId = (base ?? current)?.exercise_id;
      const name = exerciseId ? nameOf(ctx, exerciseId) : MISSING_EXERCISE;
      const baseline = mode === "record" ? null : base;
      const rows = prescriptionRows(ctx, baseline, change.set, exerciseId ?? "");
      const unchanged = mode === "pending" && base !== null && rows.length === 0;
      return {
        key,
        verb: "Change",
        title: name,
        place: dayName(ctx, current?.program_day_id),
        rows,
        warning: !current && mode === "pending" ? NOT_IN_PROGRAM : unchanged ? "Already set to these values." : null,
      };
    }

    case "swap_exercise": {
      const current = ctx.planned.get(change.planned_exercise_id);
      const base = current ? (mode === "applied" ? priorPlanned(current, inverse) : current) : null;
      const rows: DiffRow[] = [];
      const known = mode !== "record" && base !== null;
      rows.push({
        label: "Exercise",
        before: known ? nameOf(ctx, (base as PlannedExercise).exercise_id) : null,
        after: nameOf(ctx, change.exercise_id),
      });
      // A load belongs to its exercise, so the server clears it on a swap.
      if (known && (base as PlannedExercise).load !== null) {
        rows.push({ label: "Load", before: loadText((base as PlannedExercise).load, ctx.unit), after: "Cleared, set it when you next train it" });
      }
      return {
        key,
        verb: "Swap",
        title: known ? `${nameOf(ctx, (base as PlannedExercise).exercise_id)} for ${nameOf(ctx, change.exercise_id)}` : `Swap in ${nameOf(ctx, change.exercise_id)}`,
        place: dayName(ctx, current?.program_day_id),
        rows,
        warning: !current && mode === "pending" ? NOT_IN_PROGRAM : null,
      };
    }

    case "add_exercise": {
      const rows: DiffRow[] = [
        { label: "Sets", before: null, after: String(change.sets) },
        { label: "Reps", before: null, after: repRangeText(change.rep_min, change.rep_max) },
        { label: "Reps left", before: null, after: String(change.target_rir) },
        { label: "Load", before: null, after: loadDisplay(ctx, change.exercise_id, change.load) },
        { label: "Slot", before: null, after: String(change.position + 1) },
      ];
      const day = ctx.days.get(change.program_day_id);
      return {
        key,
        verb: "Add",
        title: nameOf(ctx, change.exercise_id),
        place: day?.name ?? null,
        rows,
        warning: !day && mode === "pending" ? "This day is not in your current program, so the change may not apply." : null,
      };
    }

    case "remove_exercise": {
      const current = ctx.planned.get(change.planned_exercise_id);
      const name = current ? nameOf(ctx, current.exercise_id) : MISSING_EXERCISE;
      return {
        key,
        verb: "Remove",
        title: name,
        place: dayName(ctx, current?.program_day_id),
        rows: [{ label: "In program", before: mode === "record" ? null : "Yes", after: "No, your history for it stays" }],
        warning: !current && mode === "pending" ? NOT_IN_PROGRAM : null,
      };
    }

    case "update_day": {
      const current = ctx.days.get(change.program_day_id);
      const base = current ? (mode === "applied" ? priorDay(current, inverse) : current) : null;
      const baseline = mode === "record" ? null : base;
      const rows: DiffRow[] = [];
      const push = (label: string, b: string | null, a: string) => {
        if (b === null || b !== a) rows.push({ label, before: b, after: a });
      };
      const set = change.set;
      if (set.name !== undefined) push("Name", baseline?.name ?? null, set.name);
      if (set.focus !== undefined) push("Focus", baseline ? sentence(baseline.focus) : null, sentence(set.focus));
      if (set.equipment_profile_id !== undefined) {
        const label = (id: Uuid | null) => (id === null ? "Any equipment" : (ctx.equipment.get(id)?.name ?? "An equipment profile that no longer exists"));
        push("Equipment", baseline ? label(baseline.equipment_profile_id) : null, label(set.equipment_profile_id));
      }
      return {
        key,
        verb: "Update",
        title: base?.name ?? current?.name ?? "A training day",
        place: null,
        rows,
        warning: !current && mode === "pending" ? "This day is not in your current program, so the change may not apply." : null,
      };
    }
  }
}

export function describeChanges(
  changes: readonly ProposalChange[],
  ctx: DiffContext,
  mode: DiffMode,
  inverse: readonly InverseChange[] | null = null,
): DiffBlock[] {
  return changes.map((change, i) => describeOne(change, i, ctx, mode, inverse));
}

function rowLine(row: DiffRow): string | null {
  const move = row.before === null ? row.after : `${row.before} → ${row.after}`;
  switch (row.label) {
    case "Sets":
      return `${move} sets`;
    case "Reps left":
      return `${move} reps left`;
    case "Slot":
      return null;
    default:
      return move;
  }
}

/**
 * One short line per thing a change does, in plain words, for the right side of a suggestion row:
 * "3 → 4 sets", "135 lb → 140 lb", "Removed".
 */
export function changeLines(block: DiffBlock): string[] {
  if (block.verb === "Remove") return ["Removed"];
  if (block.verb === "Swap") return block.rows.some((r) => r.label === "Load") ? ["Swapped", "Load cleared"] : ["Swapped"];
  const lines = block.rows.flatMap((r) => rowLine(r) ?? []);
  return block.verb === "Add" ? ["Added", ...lines] : lines;
}
