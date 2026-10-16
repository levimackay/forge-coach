"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { ListGroup, ListRow } from "@/components/ui/list-row";
import { named } from "@/components/ui/name";
import { NumberStepper } from "@/components/ui/number-stepper";
import { Sheet } from "@/components/ui/sheet";
import type { Exercise, Unit, WorkoutSet } from "@/lib/domain/types";
import { isUsable, loadIncrement, type EquipmentLike } from "@/lib/engine";
import { EffortWords, SheetBand, SwitchRow } from "./bits";
import { EFFORT_RIR, effortForRir } from "./effort";
import type { SetEdit } from "./session-actions";
import { loadLabel, usesLoad } from "./workout-model";

export const MAX_REPS_INPUT = 300;
export const MAX_LOAD_INPUT = 2000;

/** Edit or delete a logged set. Mount it with a `key` per set so the fields start from that set. */
export function SetEditSheet({
  set,
  exercise,
  unit,
  equipment,
  targetRir,
  setNumber,
  onClose,
  onSave,
  onDelete,
}: {
  set: WorkoutSet | null;
  exercise: Exercise | undefined;
  unit: Unit;
  equipment: EquipmentLike | null;
  /** The plan's target for this exercise, which the effort words are measured from. */
  targetRir: number;
  setNumber: number;
  onClose: () => void;
  onSave: (set: WorkoutSet, edit: SetEdit) => Promise<void>;
  onDelete: (set: WorkoutSet) => Promise<void>;
}) {
  return (
    <Sheet open={set !== null} onClose={onClose} title={set?.is_warmup ? "Warmup" : `Set ${setNumber}`}>
      {set && exercise ? (
        <EditForm
          key={set.id}
          set={set}
          exercise={exercise}
          unit={unit}
          equipment={equipment}
          targetRir={targetRir}
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
  targetRir,
  onSave,
  onDelete,
}: {
  set: WorkoutSet;
  exercise: Exercise;
  unit: Unit;
  equipment: EquipmentLike | null;
  targetRir: number;
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
      <div>
        {usesLoad(exercise) ? (
          <NumberStepper
            label={loadLabel(exercise)}
            unit={unit}
            value={draft.load}
            step={step}
            min={0}
            max={MAX_LOAD_INPUT}
            onChange={(load) => setDraft({ ...draft, load })}
          />
        ) : null}
        <NumberStepper
          label="Reps"
          value={draft.reps}
          min={1}
          max={MAX_REPS_INPUT}
          onChange={(reps) => setDraft({ ...draft, reps })}
        />
        <div className="border-t border-rule" />
      </div>
      {draft.warmup ? null : (
        <div>
          <p className="pb-2 font-light">How did it feel?</p>
          <EffortWords
            label="How did it feel"
            value={draft.rir === null ? null : effortForRir(draft.rir, targetRir)}
            onChange={(effort) => setDraft({ ...draft, rir: EFFORT_RIR[effort](targetRir) })}
          />
        </div>
      )}
      <div className="border-t border-rule">
        <SwitchRow label="Warmup" checked={draft.warmup} onChange={(warmup) => setDraft({ ...draft, warmup })} />
        <SwitchRow label="Something hurt" checked={draft.pain} onChange={(pain) => setDraft({ ...draft, pain })} />
      </div>
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
          Save
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
  onClose,
  onPick,
}: {
  current: Exercise | null;
  library: Exercise[];
  equipment: EquipmentLike | null;
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
        {empty ? <p>Nothing else fits.</p> : null}
        {options.ladder.length > 0 ? (
          <div>
            <h3 className="pt-2 text-name">{named("Other versions")}</h3>
            <ListGroup label="Other versions of this exercise" className="border-t border-rule mt-2">
              {options.ladder.map(({ exercise, hint }) => (
                <ListRow key={exercise.id} title={named(exercise.name)} name trailing={hint} onClick={() => onPick(exercise)} />
              ))}
            </ListGroup>
          </div>
        ) : null}
        {options.others.length > 0 ? (
          <div>
            <h3 className="pt-2 text-name">{named("Similar")}</h3>
            <ListGroup label="Similar exercises" className="border-t border-rule mt-2">
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
