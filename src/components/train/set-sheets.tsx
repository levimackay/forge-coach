"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { ListGroup, ListRow } from "@/components/ui/list-row";
import { NumberStepper } from "@/components/ui/number-stepper";
import { Sheet } from "@/components/ui/sheet";
import type { Exercise, Unit, WorkoutSet } from "@/lib/domain/types";
import { isUsable, loadIncrement, type EquipmentLike } from "@/lib/engine";
import { named } from "@/components/ui/name";
import { Chip, SheetBand } from "./bits";
import type { SetEdit } from "./session-actions";
import { loadLabel, usesLoad } from "./workout-model";

export const MAX_REPS_INPUT = 300;
export const MAX_LOAD_INPUT = 2000;

/**
 * Weight, reps and RIR as rows of one table, closed by a hairline. `large` is the live logger:
 * a taller weight row and no explanation under RIR.
 */
export function SetFields({
  draft,
  exercise,
  unit,
  step,
  onChange,
  large = false,
  closed = true,
}: {
  draft: SetEdit;
  exercise: Exercise;
  unit: Unit;
  step: number;
  onChange: (next: SetEdit) => void;
  large?: boolean;
  /** Draws the hairline under the last row. Leave it off when the next element draws its own top rule. */
  closed?: boolean;
}) {
  return (
    <div>
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
        onChange={(reps) => onChange({ ...draft, reps })}
      />
      {draft.warmup ? null : draft.rir === null ? (
        <div className="grid grid-cols-[var(--label-col)_minmax(0,1fr)] gap-x-2 border-t border-rule py-4">
          <span>RIR</span>
          <p>RIR is not recorded for this set. Without it FORGE waits one extra session before adding weight.</p>
        </div>
      ) : (
        <NumberStepper
          label="RIR"
          value={draft.rir}
          min={0}
          max={10}
          hint={large ? undefined : "Reps in reserve: the reps you could still have done."}
          onChange={(rir) => onChange({ ...draft, rir })}
        />
      )}
      {closed ? <div className="border-t border-rule" /> : null}
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
    <div>
      <div className="grid grid-cols-[var(--label-col)_minmax(0,1fr)] min-h-14 items-center border-b border-rule">
        <span>This set</span>
        <div role="group" aria-label="This set" className="-ml-2.5 flex flex-wrap">
          <Chip selected={draft.warmup} onClick={() => onChange({ ...draft, warmup: !draft.warmup })}>
            Warmup
          </Chip>
          <Chip selected={draft.pain} onClick={() => onChange({ ...draft, pain: !draft.pain })}>
            Pain
          </Chip>
          {draft.warmup ? null : (
            <Chip selected={draft.rir === null} onClick={() => onChange({ ...draft, rir: draft.rir === null ? defaultRir : null })}>
              No RIR
            </Chip>
          )}
        </div>
      </div>
      {draft.pain ? <p className="pt-3">This exercise will stay at its current weight next time.</p> : null}
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
      <p className="text-name">{named(exercise.name)}</p>
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
        variant="secondary"
        fullWidth
        disabled={busy === "save"}
        loading={busy === "delete"}
        onClick={() => void run("delete", () => onDelete(set))}
      >
        Delete set
      </Button>
      <SheetBand error={error}>
        <Button
          variant="primary"
          disabled={!valid || busy === "delete"}
          loading={busy === "save"}
          onClick={() => void run("save", () => onSave(set, draft))}
        >
          Save changes
        </Button>
      </SheetBand>
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
        <p>
          Instead of {current?.name}
          {equipmentName ? `, showing what fits ${equipmentName}` : ""}. Sets you already logged stay as they are.
        </p>
        {empty ? <p>Nothing else in the library fits this movement and your equipment.</p> : null}
        {options.ladder.length > 0 ? (
          <div>
            <h3 className="pt-2 text-name">{named("Same progression")}</h3>
            <ListGroup label="Variations on the same progression" className="border-t border-rule mt-2">
              {options.ladder.map(({ exercise, hint }) => (
                <ListRow key={exercise.id} title={named(exercise.name)} name trailing={hint} onClick={() => onPick(exercise)} />
              ))}
            </ListGroup>
          </div>
        ) : null}
        {options.others.length > 0 ? (
          <div>
            <h3 className="pt-2 text-name">{named("Other options")}</h3>
            <ListGroup label="Other exercises for the same movement" className="border-t border-rule mt-2">
              {options.others.map(({ exercise }) => (
                <ListRow key={exercise.id} title={named(exercise.name)} name onClick={() => onPick(exercise)} />
              ))}
            </ListGroup>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
