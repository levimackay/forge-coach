"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { IconChevronRight } from "@/components/ui/icons";
import { ListRow } from "@/components/ui/list-row";
import { named } from "@/components/ui/name";
import { Skeleton } from "@/components/ui/skeleton";
import type { Exercise, Unit, Workout, WorkoutSet } from "@/lib/domain/types";
import { loadIncrement, type EquipmentLike, type SessionPlanItem } from "@/lib/engine";
import { formatDate, formatPrescription } from "./format";
import { useLastSession, type ItemNote, type LastSession } from "./queries";
import { logSet } from "./session-actions";
import { SetFields, SetFlags } from "./set-sheets";
import {
  canLog,
  describeSet,
  draftSummary,
  initialDraft,
  lastSessionLine,
  setLine,
  type SetDraft,
} from "./workout-model";

export interface Slot {
  item: SessionPlanItem;
  /** The exercise actually being done, after any swap. */
  exercise: Exercise;
  /** Everything logged for this planned exercise in this workout, in order. */
  logged: WorkoutSet[];
  workSets: number;
}

interface ExercisePanelProps {
  slot: Slot;
  note: ItemNote | null;
  workout: Workout;
  libraryById: Map<string, Exercise>;
  equipment: EquipmentLike | null;
  unit: Unit;
  onLogged: (set: WorkoutSet) => void;
  onEdit: (set: WorkoutSet, setNumber: number) => void;
  onSwap: () => void;
  /** The rest controls and the Next row, which sit directly under the entry rows. */
  tail: ReactNode;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[var(--label-col)_minmax(0,1fr)] py-0.5">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * The exercise being done: its name and set count, what was planned, the sets already in,
 * the entry rows, and the Log set band. Mount it with a `key` per planned exercise.
 */
export function ExercisePanel({ slot, note, workout, libraryById, equipment, unit, onLogged, onEdit, onSwap, tail }: ExercisePanelProps) {
  const { item, exercise, logged, workSets } = slot;
  const last = useLastSession(exercise.id, workout.id);
  const [extra, setExtra] = useState(false);

  const planExercise = exercise.id === item.exercise.id;
  const rx = item.prescription;
  const target = planExercise ? rx : { ...rx, rep_min: exercise.default_rep_min, rep_max: exercise.default_rep_max };
  const done = workSets >= rx.sets;
  const formOpen = !done || extra;
  const targetReps = typeof item.decision.inputs.target_reps === "number" ? item.decision.inputs.target_reps : null;
  const counter =
    workSets < rx.sets ? `Set ${workSets + 1} of ${rx.sets}` : extra ? `Set ${workSets + 1}` : `${workSets} of ${rx.sets} sets`;

  let workNumber = 0;
  const numbered = logged.map((s) => ({ set: s, number: s.is_warmup ? 0 : ++workNumber }));

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4 pt-4">
        <h1 className="min-w-0 break-words text-name">{named(exercise.name)}</h1>
        <p className="shrink-0 text-fig-24">{counter}</p>
      </div>

      <div className="mb-3 mt-2">
        <dl>
          <Fact label="Plan">{formatPrescription(target)}</Fact>
        </dl>
        {note ? <p className="pl-[var(--label-col)] pt-0.5 text-why">{note.text}</p> : null}
        {numbered.length > 0 ? (
          <ol aria-label="Logged sets" className="mt-1">
            {numbered.map(({ set, number }) => (
              <li key={set.id}>
                <button
                  type="button"
                  onClick={() => onEdit(set, number)}
                  aria-label={`Edit ${set.is_warmup ? "warmup" : `set ${number}`}: ${describeSet(set, unit)}`}
                  className="grid min-h-11 w-full grid-cols-[var(--label-col)_minmax(0,1fr)_auto] items-center text-left active:underline"
                >
                  <span>{set.is_warmup ? "Warmup" : `Set ${number}`}</span>
                  <span className="min-w-0">
                    <span className="block">{setLine(set, unit)}</span>
                    {set.exercise_id !== exercise.id ? (
                      <span className="block truncate text-small">{libraryById.get(set.exercise_id)?.name ?? "Another exercise"}</span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-2">
                    {set.pain ? <span className="text-small font-medium">Pain</span> : null}
                    <IconChevronRight size={16} />
                  </span>
                </button>
              </li>
            ))}
          </ol>
        ) : null}
        <LastTime last={last} unit={unit} />
      </div>

      {formOpen ? (
        last === undefined ? (
          <Skeleton rows={5} className="border-t border-rule" />
        ) : (
          <SetForm
            key={exercise.id}
            slot={slot}
            workoutId={workout.id}
            equipment={equipment}
            unit={unit}
            last={last}
            targetReps={targetReps}
            onLogged={onLogged}
          >
            {tail}
          </SetForm>
        )
      ) : (
        <>
          <div className="border-t border-rule">
            <p className="py-4">All {rx.sets} sets done.</p>
          </div>
          {tail}
          <ListRow title="Add an extra set" onClick={() => setExtra(true)} />
        </>
      )}

      <ListRow title="Swap exercise" onClick={onSwap} chevron />
    </div>
  );
}

function LastTime({ last, unit }: { last: LastSession | null | undefined; unit: Unit }) {
  if (!last) return null;
  return (
    <dl>
      <Fact label="Last time">
        {formatDate(last.workout.started_at)}, {lastSessionLine(last.sets, unit)}
      </Fact>
    </dl>
  );
}

function SetForm({
  slot,
  workoutId,
  equipment,
  unit,
  last,
  targetReps,
  onLogged,
  children,
}: {
  slot: Slot;
  workoutId: string;
  equipment: EquipmentLike | null;
  unit: Unit;
  last: LastSession | null;
  targetReps: number | null;
  onLogged: (set: WorkoutSet) => void;
  /** Rendered between the entry rows and the set options. */
  children: ReactNode;
}) {
  const { item, exercise, logged, workSets } = slot;
  const [draft, setDraft] = useState<SetDraft>(() =>
    initialDraft({
      prescription: item.prescription,
      targetReps,
      exercise,
      planExerciseId: item.exercise.id,
      logged,
      last,
    }),
  );
  const [noteOpen, setNoteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const step = loadIncrement(exercise, equipment, unit);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = await logSet({ workoutId, plannedExerciseId: item.planned.id, exercise, draft });
      setDraft(
        initialDraft({
          prescription: item.prescription,
          targetReps,
          exercise,
          planExerciseId: item.exercise.id,
          logged: [...logged, saved],
          last,
        }),
      );
      setNoteOpen(false);
      onLogged(saved);
    } catch {
      setError("That set was not saved. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SetFields draft={draft} exercise={exercise} unit={unit} step={step} large closed={false} onChange={(d) => setDraft({ ...draft, ...d })} />
      {error ? (
        <p role="alert" className="py-3 font-medium">
          {error}
        </p>
      ) : null}
      {children}
      <SetFlags draft={draft} defaultRir={item.prescription.target_rir} onChange={(d) => setDraft({ ...draft, ...d })} />
      {noteOpen ? (
        <div className="py-3">
          <Field
            label="Note for this set"
            multiline
            rows={2}
            maxLength={1000}
            value={draft.note}
            onChange={(e) => setDraft({ ...draft, note: e.target.value })}
          />
        </div>
      ) : (
        <ListRow title="Add a note" onClick={() => setNoteOpen(true)} />
      )}
      <Button
        variant="live"
        pinned="bottom"
        loading={busy}
        disabled={!canLog(draft, exercise)}
        detail={draftSummary(draft, exercise)}
        onClick={() => void submit()}
      >
        {draft.warmup ? "Log warmup" : `Log set ${workSets + 1}`}
      </Button>
    </>
  );
}
