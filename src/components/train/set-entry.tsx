"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { named } from "@/components/ui/name";
import { NumberStepper } from "@/components/ui/number-stepper";
import { Sheet } from "@/components/ui/sheet";
import { ScreenBar } from "@/components/shell/screen-bar";
import type { Exercise, Unit, Workout, WorkoutSet } from "@/lib/domain/types";
import { loadIncrement, type EquipmentLike, type SessionPlanItem } from "@/lib/engine";
import { EffortWords } from "./bits";
import { EFFORT_RIR, effortForRir, type Effort } from "./effort";
import { formatNumber } from "./format";
import { useLastSession, type LastSession } from "./queries";
import { logSet } from "./session-actions";
import { ScreenSkeleton } from "./skeletons";
import { MAX_LOAD_INPUT, MAX_REPS_INPUT } from "./set-sheets";
import { canLog, initialDraft, loadLabel, usesLoad, type SetDraft } from "./workout-model";

export interface Slot {
  item: SessionPlanItem;
  /** The exercise actually being done, after any swap. */
  exercise: Exercise;
  /** Everything logged for this planned exercise in this workout, in order. */
  logged: WorkoutSet[];
  workSets: number;
}

/** What the two top links of the logger do. */
export interface EntryChrome {
  onMore: () => void;
  onEnd: () => void;
}

/** The two top links, shared by every screen of the logger that is not a rest. */
export function LoggerBar({ onMore, onEnd }: EntryChrome) {
  return (
    <ScreenBar
      start={
        <Button variant="ghost" size="sm" className="-ml-2" onClick={onMore}>
          More
        </Button>
      }
      end={
        <Button variant="ghost" size="sm" className="-mr-2" onClick={onEnd}>
          End workout
        </Button>
      }
    />
  );
}

/** What the big figure says while there is no number yet. */
const UNSET = "?";

/** The big figures step down so a long weight still fits beside its Change link. */
const figureClass = (text: string): string =>
  text.length <= 4 ? "text-fig-112" : text.length === 5 ? "text-fig-88" : "text-fig-72";

function NumberRow({
  label,
  unit,
  shown,
  first,
  onChange,
}: {
  label: string;
  unit: string;
  shown: string;
  first?: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      aria-label={`${label}, ${shown === UNSET ? "not set" : `${shown} ${unit}`}. Change.`}
      className={`grid h-40 w-full grid-cols-[minmax(0,1fr)_auto] items-baseline border-t border-rule pt-[30px] text-left ${
        first ? "mt-6" : ""
      }`}
    >
      <span className="-ml-1.5 flex min-w-0 items-baseline">
        <span className={figureClass(shown)}>{shown}</span>
        <span className="ml-1 text-body">{unit}</span>
      </span>
      <span className="text-small underline decoration-1 underline-offset-4">Change</span>
    </button>
  );
}

/** Edits one number in a sheet, with the stepper's own buttons and keyboard. */
function NumberSheet({
  open,
  onClose,
  label,
  unit,
  value,
  step = 1,
  min,
  max,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  unit?: string;
  value: number | null;
  step?: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={label}
      footer={
        <Button variant="primary" onClick={onClose} className="w-full">
          Done
        </Button>
      }
    >
      <NumberStepper large label={label} unit={unit} value={value} step={step} min={min} max={max} onChange={onChange} />
      <div className="border-t border-rule" />
    </Sheet>
  );
}

interface SetEntryProps {
  slot: Slot;
  workout: Workout;
  equipment: EquipmentLike | null;
  unit: Unit;
  last: LastSession | null;
  chrome: EntryChrome;
  /** Called with the saved set, so the logger can start the rest and move on. */
  onLogged: (set: WorkoutSet) => void;
  /** The More sheet, given the draft's flags so it can change them. Rendered here so they stay in one place. */
  more: (flags: { draft: SetDraft; onChange: (change: Partial<SetDraft>) => void }) => ReactNode;
}

/** Loads last time's sets, then hands over to the entry. */
export function SetEntryLoader(props: Omit<SetEntryProps, "last">) {
  const { slot, workout } = props;
  const last = useLastSession(slot.exercise.id, workout.id);
  if (last === undefined) return <ScreenSkeleton rows={4} label="Loading set" />;
  // A new set starts from what was just logged, so the entry begins again for every set.
  const key = `${slot.item.planned.id}:${slot.exercise.id}:${slot.logged.length}`;
  return <SetEntry key={key} {...props} last={last} />;
}

/**
 * One set: the weight and the reps, prefilled from the plan, and how it felt. Mount it with a key
 * per set, so the draft starts again each time.
 */
function SetEntry({ slot, workout, equipment, unit, last, chrome, onLogged, more }: SetEntryProps) {
  const { item, exercise, logged, workSets } = slot;
  const rx = item.prescription;
  const target = rx.target_rir;
  const targetReps = typeof item.decision.inputs.target_reps === "number" ? item.decision.inputs.target_reps : null;
  const [draft, setDraft] = useState<SetDraft>(() =>
    initialDraft({ prescription: rx, targetReps, exercise, planExerciseId: item.exercise.id, logged, last }),
  );
  const [editing, setEditing] = useState<"load" | "reps" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const change = (patch: Partial<SetDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const hasLoad = usesLoad(exercise);
  const label = loadLabel(exercise);
  const effort: Effort | null = draft.rir === null ? null : effortForRir(draft.rir, target);
  const setLine = draft.warmup
    ? "Warmup"
    : workSets < rx.sets
      ? `Set ${workSets + 1} of ${rx.sets}`
      : `Set ${workSets + 1}`;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      onLogged(await logSet({ workoutId: workout.id, plannedExerciseId: item.planned.id, exercise, draft }));
    } catch {
      setError("That set was not saved. Try again.");
      setBusy(false);
    }
  };

  return (
    <div className="pb-[calc(var(--live-band-height)+env(safe-area-inset-bottom)+16px)]">
      <LoggerBar {...chrome} />
      <h1 className="text-head font-medium">{named(exercise.name)}</h1>
      <p className="mt-1.5 font-light">
        {setLine}
        {draft.pain ? ", something hurt" : ""}
      </p>

      {hasLoad ? (
        <NumberRow
          first
          label={label}
          unit={unit}
          shown={draft.load === null ? UNSET : formatNumber(draft.load)}
          onChange={() => setEditing("load")}
        />
      ) : null}
      <NumberRow
        first={!hasLoad}
        label="Reps"
        unit={draft.reps === 1 ? "rep" : "reps"}
        shown={draft.reps === null ? UNSET : String(draft.reps)}
        onChange={() => setEditing("reps")}
      />

      {draft.warmup ? null : (
        <>
          <p className="mb-2 mt-[22px] font-light">How did it feel?</p>
          <EffortWords label="How did it feel" value={effort} onChange={(e) => change({ rir: EFFORT_RIR[e](target) })} />
        </>
      )}

      {error ? (
        <p role="alert" className="pt-3 font-medium">
          {error}
        </p>
      ) : null}

      <Button variant="live" pinned="bottom" loading={busy} disabled={!canLog(draft, exercise)} onClick={() => void submit()}>
        Done
      </Button>

      <NumberSheet
        open={editing === "load"}
        onClose={() => setEditing(null)}
        label={label}
        unit={unit}
        value={draft.load}
        step={loadIncrement(exercise, equipment, unit)}
        min={0}
        max={MAX_LOAD_INPUT}
        onChange={(load) => change({ load })}
      />
      <NumberSheet
        open={editing === "reps"}
        onClose={() => setEditing(null)}
        label="Reps"
        value={draft.reps}
        min={1}
        max={MAX_REPS_INPUT}
        onChange={(reps) => change({ reps })}
      />
      {more({ draft, onChange: change })}
    </div>
  );
}
