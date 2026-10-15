"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { ListGroup, ListRow } from "@/components/ui/list-row";
import { NumberStepper } from "@/components/ui/number-stepper";
import { Sheet } from "@/components/ui/sheet";
import type { Exercise, Unit, WorkoutSet } from "@/lib/domain/types";
import { isUsable, loadIncrement, type EquipmentLike } from "@/lib/engine";
import { Chip } from "./bits";
import type { SetEdit } from "./session-actions";
import { loadLabel, usesLoad } from "./workout-model";

export const MAX_REPS_INPUT = 300;
export const MAX_LOAD_INPUT = 2000;

/** Weight, reps and RIR steppers that every set form shares. */
export function SetFields({
  draft,
  exercise,
  unit,
  step,
  onChange,
  large = false,
}: {
  draft: SetEdit;
  exercise: Exercise;
  unit: Unit;
  step: number;
  onChange: (next: SetEdit) => void;
  large?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {usesLoad(exercise) ? (
        <NumberStepper
          label={loadLabel(exercise)}
          unit={unit}
          value={draft.load}
          step={step}
          min={0}
          max={MAX_LOAD_INPUT}
          large={large}
          hint={
            draft.load === null && exercise.load_type === "external"
              ? "Enter the weight you used to log this set."
              : exercise.equipment.includes("dumbbells")
                ? "The weight of one dumbbell."
                : undefined
          }
          onChange={(load) => onChange({ ...draft, load })}
        />
      ) : null}
      <NumberStepper
        label="Reps"
        value={draft.reps}
        min={1}
        max={MAX_REPS_INPUT}
        large={large}
        onChange={(reps) => onChange({ ...draft, reps })}
      />
      {draft.warmup ? null : draft.rir === null ? (
        <p className="text-[15px] text-ink-dim">
          RIR is not recorded for this set. Without it FORGE waits one extra session before adding weight.
        </p>
      ) : (
        <NumberStepper
          label="Reps in reserve (RIR)"
          value={draft.rir}
          min={0}
          max={10}
          hint="Reps you could still have done."
          onChange={(rir) => onChange({ ...draft, rir })}
        />
      )}
    </div>
  );
}

/** Warmup, pain and no-RIR toggles. `defaultRir` is what turning RIR back on starts from. */
export function SetFlags({
  draft,
  defaultRir,
  onChange,
}: {
  draft: SetEdit;
  defaultRir: number;
  onChange: (next: SetEdit) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Chip selected={draft.warmup} onClick={() => onChange({ ...draft, warmup: !draft.warmup })}>
          Warmup
        </Chip>
        <Chip tone="danger" selected={draft.pain} onClick={() => onChange({ ...draft, pain: !draft.pain })}>
          Pain
        </Chip>
        {draft.warmup ? null : (
          <Chip selected={draft.rir === null} onClick={() => onChange({ ...draft, rir: draft.rir === null ? defaultRir : null })}>
            No RIR
          </Chip>
        )}
      </div>
      {draft.pain ? (
        <p className="text-[15px] text-ink-dim">This exercise will stay at its current weight next time.</p>
      ) : null}
    </div>
  );
}

/** Edit or delete a logged set. Mount it with a `key` per set so the fields start from that set. */
export function SetEditSheet({
  set,
  exercise,
  unit,
  equipment,
  setNumber,
  onClose,
  onSave,
  onDelete,
}: {
  set: WorkoutSet | null;
  exercise: Exercise | undefined;
  unit: Unit;
  equipment: EquipmentLike | null;
  setNumber: number;
  onClose: () => void;
  onSave: (set: WorkoutSet, edit: SetEdit) => Promise<void>;
  onDelete: (set: WorkoutSet) => Promise<void>;
}) {
  return (
    <Sheet open={set !== null} onClose={onClose} title={set?.is_warmup ? "Edit warmup" : `Edit set ${setNumber}`}>
      {set && exercise ? (
        <EditForm
          key={set.id}
          set={set}
          exercise={exercise}
          unit={unit}
          equipment={equipment}
          onSave={onSave}
          onDelete={onDelete}
        />
      ) : null}
    </Sheet>
  );
}

function EditForm({
  set,
  exercise,
  unit,
  equipment,
  onSave,
  onDelete,
}: {
  set: WorkoutSet;
  exercise: Exercise;
  unit: Unit;
  equipment: EquipmentLike | null;
  onSave: (set: WorkoutSet, edit: SetEdit) => Promise<void>;
  onDelete: (set: WorkoutSet) => Promise<void>;
}) {
  const [draft, setDraft] = useState<SetEdit>({
    reps: set.reps,
    load: set.load,
    rir: set.rir,
    warmup: set.is_warmup,
    pain: set.pain,
    note: set.notes ?? "",
  });
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const step = loadIncrement(exercise, equipment, unit);
  const valid = draft.reps !== null && draft.reps >= 1 && (exercise.load_type !== "external" || draft.load !== null);

  // Errors stay inside the sheet: a toast would sit behind the modal and never be seen.
  const run = async (kind: "save" | "delete", action: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await action();
    } catch {
      setError(kind === "save" ? "The change was not saved. Try again." : "The set was not deleted. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[17px] text-ink-dim">{exercise.name}</p>
      <SetFields draft={draft} exercise={exercise} unit={unit} step={step} onChange={setDraft} />
      <SetFlags draft={draft} defaultRir={2} onChange={setDraft} />
      <Field
        label="Note"
        multiline
        rows={2}
        maxLength={1000}
        value={draft.note}
        onChange={(e) => setDraft({ ...draft, note: e.target.value })}
      />
      <Button
        variant="danger"
        fullWidth
        disabled={busy === "save"}
        loading={busy === "delete"}
        onClick={() => void run("delete", () => onDelete(set))}
      >
        Delete set
      </Button>
      {/* Last in the form and pinned to the bottom of the sheet while the fields scroll. */}
      <div className="sticky bottom-0 -mx-5 -mb-4 flex flex-col gap-2 border-t border-line bg-surface px-5 pb-4 pt-3">
        {error ? (
          <p role="alert" className="text-[15px] text-danger">
            {error}
          </p>
        ) : null}
        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={!valid || busy === "delete"}
          loading={busy === "save"}
          onClick={() => void run("save", () => onSave(set, draft))}
        >
          Save changes
        </Button>
      </div>
    </div>
  );
}

interface SwapOption {
  exercise: Exercise;
  hint?: string;
}

/** Variations of the current exercise that the equipment allows: its ladder first, then others for the same muscle. */
export function swapOptions(current: Exercise, library: Exercise[], equipment: EquipmentLike | null): {
  ladder: SwapOption[];
  others: SwapOption[];
} {
  const usable = library.filter((e) => e.id !== current.id && !e.deleted_at && isUsable(e, equipment));
  const group = current.progression_group;
  const ladder = usable
    .filter((e) => group !== null && e.progression_group === group)
    .sort((a, b) => (a.ladder_level ?? 0) - (b.ladder_level ?? 0))
    .map((exercise): SwapOption => {
      const level = exercise.ladder_level ?? 0;
      const here = current.ladder_level ?? 0;
      return { exercise, hint: level < here ? "Easier" : level > here ? "Harder" : undefined };
    });
  const others = usable
    .filter(
      (e) =>
        (group === null || e.progression_group !== group) &&
        e.movement_pattern === current.movement_pattern &&
        e.primary_muscle === current.primary_muscle,
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((exercise): SwapOption => ({ exercise }));
  return { ladder, others };
}

export function SwapSheet({
  current,
  library,
  equipment,
  equipmentName,
  onClose,
  onPick,
}: {
  current: Exercise | null;
  library: Exercise[];
  equipment: EquipmentLike | null;
  equipmentName: string | null;
  onClose: () => void;
  onPick: (exercise: Exercise) => void;
}) {
  const options = useMemo(
    () => (current ? swapOptions(current, library, equipment) : { ladder: [], others: [] }),
    [current, library, equipment],
  );
  const empty = options.ladder.length === 0 && options.others.length === 0;

  return (
    <Sheet open={current !== null} onClose={onClose} title="Swap exercise">
      <div className="flex flex-col gap-4 pb-2">
        <p className="text-[15px] text-ink-dim">
          Instead of {current?.name}
          {equipmentName ? `, showing what fits ${equipmentName}` : ""}. Sets you already logged stay as they are.
        </p>
        {empty ? (
          <p className="text-[17px]">Nothing else in the library fits this movement and your equipment.</p>
        ) : null}
        {options.ladder.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="px-1 text-[15px] font-semibold text-ink-dim">Same progression</h3>
            <ListGroup label="Variations on the same progression">
              {options.ladder.map(({ exercise, hint }) => (
                <ListRow key={exercise.id} title={exercise.name} trailing={hint} onClick={() => onPick(exercise)} />
              ))}
            </ListGroup>
          </div>
        ) : null}
        {options.others.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="px-1 text-[15px] font-semibold text-ink-dim">Other options</h3>
            <ListGroup label="Other exercises for the same movement">
              {options.others.map(({ exercise }) => (
                <ListRow key={exercise.id} title={exercise.name} onClick={() => onPick(exercise)} />
              ))}
            </ListGroup>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
