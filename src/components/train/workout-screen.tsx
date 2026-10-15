"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { Notice } from "./bits";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { IconChevronRight } from "@/components/ui/icons";
import { NumberStepper } from "@/components/ui/number-stepper";
import { Sheet } from "@/components/ui/sheet";
import { completeWorkout, useWorkoutSets } from "@/lib/local";
import type { Exercise, WorkoutSet } from "@/lib/domain/types";
import { ExerciseCard, type Slot } from "./exercise-card";
import { countLabel, formatDuration } from "./format";
import {
  buildPlan,
  itemNote,
  resolveEquipment,
  setSwap,
  useWorkoutData,
  type PlanContext,
  type WorkoutData,
} from "./queries";
import { RestBar, loadRest, saveRest, type RestState } from "./rest-bar";
import { SessionDetail } from "./session-detail";
import { discardWorkout, removeSet, restoreSet, saveSetEdit, type SetEdit } from "./session-actions";
import { SetEditSheet, SwapSheet } from "./set-sheets";
import { ScreenSkeleton } from "./skeletons";
import { useNow } from "./use-now";
import {
  currentExerciseId,
  firstOpenIndex,
  groupByPlanned,
  minutesBetween,
  restSecondsFor,
  sessionTotals,
  workSetsOf,
} from "./workout-model";

export function WorkoutScreen() {
  const id = useSearchParams().get("id");
  const data = useWorkoutData(id);
  const sets = useWorkoutSets(id);

  if (!id) {
    return (
      <EmptyState
        title="No workout selected"
        action={
          <ButtonLink href="/today" variant="primary" size="lg">
            Back to Today
          </ButtonLink>
        }
      >
        Start a workout from Today and it opens here.
      </EmptyState>
    );
  }
  if (data === undefined || sets === undefined) return <ScreenSkeleton rows={5} label="Loading workout" />;
  if (data === null) {
    return (
      <EmptyState
        title="Workout not found"
        action={
          <ButtonLink href="/today" variant="primary" size="lg">
            Back to Today
          </ButtonLink>
        }
      >
        This workout is not on this device. If you started it on another device, wait for it to sync.
      </EmptyState>
    );
  }
  if (data.workout.status === "completed") return <SessionDetail workoutId={data.workout.id} variant="finished" />;
  if (data.workout.status === "abandoned") {
    return (
      <EmptyState
        title="This workout was discarded"
        action={
          <ButtonLink href="/today" variant="primary" size="lg">
            Back to Today
          </ButtonLink>
        }
      >
        Its sets stay on this device but do not affect your plan.
      </EmptyState>
    );
  }
  if (!data.ctx) {
    return (
      <EmptyState
        title="This workout has no program day"
        action={
          <ButtonLink href="/today" variant="primary" size="lg">
            Back to Today
          </ButtonLink>
        }
      >
        Its program day was removed, so there is no plan to log against. Start a new workout from Today.
      </EmptyState>
    );
  }
  return <Logger data={data as WorkoutData & { ctx: PlanContext }} sets={sets} />;
}

function Logger({ data, sets }: { data: WorkoutData & { ctx: PlanContext }; sets: WorkoutSet[] }) {
  const { workout, ctx, swaps } = data;
  const router = useRouter();
  const now = useNow();

  const equipment = resolveEquipment(ctx, workout.equipment_profile_id);
  const plan = useMemo(() => buildPlan(ctx, equipment, workout.started_at), [ctx, equipment, workout.started_at]);
  const libraryById = useMemo(() => new Map(ctx.library.map((e) => [e.id, e])), [ctx.library]);
  const byPlanned = useMemo(() => groupByPlanned(sets), [sets]);

  const slots: Slot[] = useMemo(
    () =>
      plan.map((item) => {
        const logged = byPlanned.get(item.planned.id) ?? [];
        const id = currentExerciseId({ planExerciseId: item.exercise.id, swappedTo: swaps[item.planned.id], sets: logged });
        return {
          item,
          exercise: libraryById.get(id) ?? item.exercise,
          logged,
          workSets: workSetsOf(logged).length,
        };
      }),
    [plan, byPlanned, swaps, libraryById],
  );

  // Until the lifter picks a card, the first exercise with sets left is open.
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const firstOpen = firstOpenIndex(slots.map((s) => ({ workSets: s.workSets, target: s.item.prescription.sets })));
  const openId = picked === undefined ? (slots[firstOpen]?.item.planned.id ?? null) : picked;

  const scrolled = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (picked !== undefined && picked !== scrolled.current && picked !== null) {
      document.getElementById(`exercise-${picked}`)?.scrollIntoView({ block: "start" });
    }
    scrolled.current = picked;
  }, [picked]);

  const [rest, setRest] = useState<RestState | null>(() => loadRest(workout.id));
  const changeRest = useCallback(
    (next: RestState | null) => {
      setRest(next);
      saveRest(workout.id, next);
    },
    [workout.id],
  );

  const [editing, setEditing] = useState<{ set: WorkoutSet; number: number } | null>(null);
  const [swapping, setSwapping] = useState<Slot | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [undo, setUndo] = useState<WorkoutSet | null>(null);
  const [discardError, setDiscardError] = useState<string | null>(null);

  // The undo offer lasts a few seconds. It is a notice in the page, not a toast, because
  // a toast would sit on top of the Log set button.
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), 7000);
    return () => clearTimeout(timer);
  }, [undo]);

  const totals = sessionTotals(sets);
  const allDone = slots.length > 0 && firstOpen === -1;
  const minutes = now === null ? null : minutesBetween(workout.started_at, now);

  const handleLogged = (slot: Slot, set: WorkoutSet) => {
    setAnnouncement(
      set.is_warmup
        ? `Warmup logged for ${slot.exercise.name}.`
        : `Set ${slot.workSets + 1} logged for ${slot.exercise.name}.`,
    );
    const seconds = restSecondsFor(slot.item.planned, set.is_warmup);
    // The rest runs from the moment the set was saved.
    changeRest({ endsAt: Date.parse(set.completed_at) + seconds * 1000, total: seconds });
    // The last planned set of an exercise moves the lifter on to the next one.
    if (!set.is_warmup && slot.workSets + 1 === slot.item.prescription.sets) {
      const index = slots.indexOf(slot);
      const next = slots.find((s, i) => i > index && s.workSets < s.item.prescription.sets);
      setPicked(next ? next.item.planned.id : null);
    }
  };

  // These throw on failure so the sheet can show the error where the lifter is looking.
  const saveEdit = async (set: WorkoutSet, edit: SetEdit) => {
    await saveSetEdit(set, edit);
    setEditing(null);
  };

  const deleteSet = async (set: WorkoutSet) => {
    await removeSet(set.id);
    setEditing(null);
    setUndo(set);
  };

  const pickSwap = async (exercise: Exercise) => {
    if (!swapping) return;
    const plannedId = swapping.item.planned.id;
    setSwapping(null);
    await setSwap(workout.id, plannedId, exercise.id);
  };

  const finish = async (rpe: number | null, notes: string) => {
    await completeWorkout(workout.id, { session_rpe: rpe, notes: notes.trim() === "" ? undefined : notes.trim() });
    saveRest(workout.id, null);
  };

  const discard = async () => {
    setDiscardError(null);
    try {
      await discardWorkout(workout);
      saveRest(workout.id, null);
      router.replace("/today");
    } catch {
      setDiscardError("The workout was not discarded. Try again.");
    }
  };

  const untrained = slots.filter((s) => s.workSets === 0).map((s) => s.exercise.name);
  const editingExercise = editing ? libraryById.get(editing.set.exercise_id) : undefined;

  return (
    <div className={`flex flex-col gap-4 ${rest ? "pb-28" : "pb-4"}`}>
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <Link href="/today" className="-ml-2 flex min-h-11 items-center gap-0.5 px-2 text-[17px] text-ink-dim active:text-ink">
            <IconChevronRight size={20} className="rotate-180" />
            Today
          </Link>
          <Button variant="secondary" size="sm" disabled={totals.workSets === 0} onClick={() => setFinishOpen(true)}>
            Finish
          </Button>
        </div>
        <h1 className="title-large">{ctx.day.name}</h1>
        <p className="text-[15px] text-ink-dim">
          {[equipment?.name, minutes === null ? null : formatDuration(minutes), countLabel(totals.workSets, "set")]
            .filter(Boolean)
            .join(", ")}
        </p>
      </header>

      {undo ? (
        <div role="status">
          <Notice
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void restoreSet(undo);
                  setUndo(null);
                }}
              >
                Undo
              </Button>
            }
          >
            Set deleted.
          </Notice>
        </div>
      ) : null}

      {slots.length === 0 ? (
        <EmptyState
          title="Nothing planned for this day"
          action={
            <ButtonLink href="/program" variant="secondary">
              Add exercises
            </ButtonLink>
          }
        >
          Add exercises to this day in Program, then come back.
        </EmptyState>
      ) : (
        <ol className="flex flex-col gap-3">
          {slots.map((slot) => (
            <ExerciseCard
              key={slot.item.planned.id}
              slot={slot}
              note={itemNote(slot.item, ctx.lastDecisions[slot.item.planned.id])}
              workout={workout}
              libraryById={libraryById}
              equipment={equipment}
              unit={ctx.unit}
              open={openId === slot.item.planned.id}
              onToggle={() => setPicked(openId === slot.item.planned.id ? null : slot.item.planned.id)}
              onLogged={(set) => handleLogged(slot, set)}
              onEdit={(set, number) => setEditing({ set, number })}
              onSwap={() => setSwapping(slot)}
            />
          ))}
        </ol>
      )}

      <div className="flex flex-col gap-3 pt-2">
        <Button
          variant={allDone ? "primary" : "secondary"}
          size="lg"
          fullWidth
          disabled={totals.workSets === 0}
          onClick={() => setFinishOpen(true)}
        >
          Finish workout
        </Button>
        {totals.workSets === 0 ? (
          <p className="text-center text-[15px] text-ink-dim">Log at least one set to finish.</p>
        ) : null}
        <Button variant="ghost" fullWidth onClick={() => setDiscardOpen(true)}>
          Discard workout
        </Button>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>

      {rest ? <RestBar rest={rest} onChange={changeRest} /> : null}

      <SetEditSheet
        set={editing?.set ?? null}
        setNumber={editing?.number ?? 0}
        exercise={editingExercise}
        unit={ctx.unit}
        equipment={equipment}
        onClose={() => setEditing(null)}
        onSave={saveEdit}
        onDelete={deleteSet}
      />

      <SwapSheet
        current={swapping?.exercise ?? null}
        library={ctx.library}
        equipment={equipment}
        equipmentName={equipment?.name ?? null}
        onClose={() => setSwapping(null)}
        onPick={(exercise) => void pickSwap(exercise)}
      />

      <FinishSheet
        open={finishOpen}
        onClose={() => setFinishOpen(false)}
        exercises={totals.exercises}
        workSets={totals.workSets}
        minutes={minutes}
        untrained={untrained}
        onFinish={finish}
      />

      <Sheet
        open={discardOpen}
        onClose={() => setDiscardOpen(false)}
        title="Discard this workout?"
        footer={
          <div className="flex flex-col gap-3">
            <Button variant="danger" fullWidth onClick={() => void discard()}>
              Discard workout
            </Button>
            <Button variant="secondary" fullWidth onClick={() => setDiscardOpen(false)}>
              Keep logging
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-[17px] text-ink-dim">
            {totals.workSets > 0
              ? `The ${countLabel(totals.workSets, "set")} you logged will not count toward your progress or change your plan.`
              : "Nothing has been logged yet."}
          </p>
          {discardError ? (
            <p role="alert" className="text-[15px] text-danger">
              {discardError}
            </p>
          ) : null}
        </div>
      </Sheet>
    </div>
  );
}

function FinishSheet({
  open,
  onClose,
  exercises,
  workSets,
  minutes,
  untrained,
  onFinish,
}: {
  open: boolean;
  onClose: () => void;
  exercises: number;
  workSets: number;
  minutes: number | null;
  untrained: string[];
  onFinish: (rpe: number | null, notes: string) => Promise<void>;
}) {
  const [rpe, setRpe] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onFinish(rpe, notes);
    } catch {
      setError("The workout was not finished. Your sets are still saved. Try again.");
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Finish workout"
      footer={
        <Button variant="primary" size="lg" fullWidth loading={busy} onClick={() => void submit()}>
          Finish and update my plan
        </Button>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        <p className="text-[17px] text-ink-dim">
          {countLabel(exercises, "exercise")}, {countLabel(workSets, "work set")}
          {minutes !== null ? `, ${formatDuration(minutes)}` : ""}.
        </p>
        {untrained.length > 0 ? (
          <p className="text-[15px] text-ink-dim">Not trained, so unchanged: {untrained.join(", ")}.</p>
        ) : null}
        <NumberStepper
          label="Session effort (RPE)"
          value={rpe}
          min={1}
          max={10}
          hint="How hard the whole session felt, from 1 (easy) to 10 (all out). Optional."
          onChange={setRpe}
        />
        <Field
          label="Notes (optional)"
          multiline
          rows={3}
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        {error ? (
          <p role="alert" className="text-[15px] text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
