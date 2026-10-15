"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { IconCheck, IconChevronRight } from "@/components/ui/icons";
import type { Exercise, Unit, Workout, WorkoutSet } from "@/lib/domain/types";
import { loadIncrement, type EquipmentLike, type SessionPlanItem } from "@/lib/engine";
import { SetDots } from "./bits";
import { PROGRESS_ACTIONS, formatDate, formatLoad, formatPrescription } from "./format";
import { useLastSession, type ItemNote, type LastSession } from "./queries";
import { logSet } from "./session-actions";
import { SetFields, SetFlags } from "./set-sheets";
import {
  canLog,
  describeSet,
  initialDraft,
  lastSessionLine,
  usesLoad,
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

interface ExerciseCardProps {
  slot: Slot;
  note: ItemNote | null;
  workout: Workout;
  libraryById: Map<string, Exercise>;
  equipment: EquipmentLike | null;
  unit: Unit;
  open: boolean;
  onToggle: () => void;
  onLogged: (set: WorkoutSet) => void;
  onEdit: (set: WorkoutSet, setNumber: number) => void;
  onSwap: () => void;
}

export function ExerciseCard({
  slot,
  note,
  workout,
  libraryById,
  equipment,
  unit,
  open,
  onToggle,
  onLogged,
  onEdit,
  onSwap,
}: ExerciseCardProps) {
  const { item, exercise, workSets } = slot;
  const target = item.prescription.sets;
  const done = workSets >= target;
  const panelId = `panel-${item.planned.id}`;

  return (
    <li id={`exercise-${item.planned.id}`} className="scroll-mt-4 overflow-clip rounded-card border border-line bg-surface">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left active:bg-raised"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[17px] font-semibold">{exercise.name}</span>
            <span className="mt-1 flex items-center gap-3 text-[15px] text-ink-dim">
              <SetDots done={workSets} total={target} />
              <span>{done ? `${workSets} sets done` : `${workSets} of ${target} sets`}</span>
            </span>
          </span>
          {done ? (
            <IconCheck size={22} className="shrink-0 text-ember" />
          ) : (
            <IconChevronRight size={20} className={`shrink-0 text-ink-faint transition-transform ${open ? "rotate-90" : ""}`} />
          )}
        </button>
      </h2>
      {open ? (
        <div id={panelId} className="flex flex-col gap-4 border-t border-line px-4 pb-4 pt-3">
          <ExerciseBody
            slot={slot}
            note={note}
            workout={workout}
            libraryById={libraryById}
            equipment={equipment}
            unit={unit}
            onLogged={onLogged}
            onEdit={onEdit}
            onSwap={onSwap}
          />
        </div>
      ) : null}
    </li>
  );
}

function ExerciseBody({
  slot,
  note,
  workout,
  libraryById,
  equipment,
  unit,
  onLogged,
  onEdit,
  onSwap,
}: Omit<ExerciseCardProps, "open" | "onToggle">) {
  const { item, exercise, logged, workSets } = slot;
  const last = useLastSession(exercise.id, workout.id);
  const [extra, setExtra] = useState(false);

  const planExercise = exercise.id === item.exercise.id;
  const rx = item.prescription;
  const target = planExercise
    ? rx
    : { ...rx, rep_min: exercise.default_rep_min, rep_max: exercise.default_rep_max };
  const done = workSets >= rx.sets;
  const formOpen = !done || extra;
  const targetReps = typeof item.decision.inputs.target_reps === "number" ? item.decision.inputs.target_reps : null;

  let workNumber = 0;
  const numbered = logged.map((s) => ({ set: s, number: s.is_warmup ? 0 : ++workNumber }));

  return (
    <>
      <div className="flex flex-col gap-1">
        <p className="text-[17px]">
          {formatPrescription(target)}
          {usesLoad(exercise) && planExercise && rx.load !== null ? ` at ${formatLoad(rx.load, unit)}` : ""}
        </p>
        {note ? (
          <p className="flex gap-2 text-[15px] text-ink-dim">
            {PROGRESS_ACTIONS.has(note.action) ? (
              <span aria-hidden="true" className="mt-[7px] h-2 w-2 shrink-0 rounded-full bg-ember" />
            ) : null}
            <span>{note.text}</span>
          </p>
        ) : null}
        <LastTime last={last} unit={unit} />
      </div>

      {numbered.length > 0 ? (
        <ol aria-label="Logged sets" className="overflow-hidden rounded-control border border-line">
          {numbered.map(({ set, number }) => (
            <li key={set.id} className="border-b border-line last:border-b-0">
              <button
                type="button"
                onClick={() => onEdit(set, number)}
                aria-label={`Edit ${set.is_warmup ? "warmup" : `set ${number}`}: ${describeSet(set, unit)}`}
                className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left active:bg-raised"
              >
                <span className="w-16 shrink-0 text-[15px] text-ink-dim">{set.is_warmup ? "Warmup" : `Set ${number}`}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px]">{describeSet(set, unit)}</span>
                  {set.exercise_id !== exercise.id ? (
                    <span className="block truncate text-[13px] text-ink-faint">
                      {libraryById.get(set.exercise_id)?.name ?? "Another exercise"}
                    </span>
                  ) : null}
                </span>
                {set.pain ? <span className="shrink-0 text-[13px] font-semibold text-danger">Pain</span> : null}
                <IconChevronRight size={18} className="shrink-0 text-ink-faint" />
              </button>
            </li>
          ))}
        </ol>
      ) : null}

      {formOpen ? (
        last === undefined ? (
          <div aria-hidden="true" className="h-64 animate-pulse rounded-control bg-raised" />
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
          />
        )
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[17px] text-ink-dim">All {rx.sets} sets done.</p>
          <Button variant="secondary" fullWidth onClick={() => setExtra(true)}>
            Add an extra set
          </Button>
        </div>
      )}

      <div>
        <Button variant="ghost" size="sm" className="-ml-4" onClick={onSwap}>
          Swap exercise
        </Button>
      </div>
    </>
  );
}

function LastTime({ last, unit }: { last: LastSession | null | undefined; unit: Unit }) {
  if (!last) return null;
  return (
    <p className="text-[15px] text-ink-dim">
      Last time, {formatDate(last.workout.started_at)}: {lastSessionLine(last.sets, unit)}
    </p>
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
}: {
  slot: Slot;
  workoutId: string;
  equipment: EquipmentLike | null;
  unit: Unit;
  last: LastSession | null;
  targetReps: number | null;
  onLogged: (set: WorkoutSet) => void;
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
    <div className="flex flex-col gap-5">
      <SetFields draft={draft} exercise={exercise} unit={unit} step={step} large onChange={(d) => setDraft({ ...draft, ...d })} />
      <SetFlags draft={draft} defaultRir={item.prescription.target_rir} onChange={(d) => setDraft({ ...draft, ...d })} />
      {noteOpen ? (
        <Field
          label="Note for this set"
          multiline
          rows={2}
          maxLength={1000}
          value={draft.note}
          onChange={(e) => setDraft({ ...draft, note: e.target.value })}
        />
      ) : (
        <div>
          <Button variant="ghost" size="sm" className="-ml-4" onClick={() => setNoteOpen(true)}>
            Add a note
          </Button>
        </div>
      )}
      {/* Stays at the bottom of the screen while the form is in view, above the rest timer when one is running (the timer publishes its height). */}
      <div className="sticky bottom-[var(--rest-bar-height,env(safe-area-inset-bottom))] z-10 -mx-4 -mb-4 flex flex-col gap-2 border-t border-line bg-surface px-4 pb-4 pt-3">
        {error ? (
          <p role="alert" className="text-[15px] text-danger">
            {error}
          </p>
        ) : null}
        <Button variant="primary" size="lg" fullWidth loading={busy} disabled={!canLog(draft, exercise)} onClick={() => void submit()}>
          {draft.warmup ? "Log warmup" : `Log set ${workSets + 1}`}
        </Button>
      </div>
    </div>
  );
}
