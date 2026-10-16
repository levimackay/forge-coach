"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { named } from "@/components/ui/name";
import { useToast } from "@/components/ui/toast";
import { completeWorkout, useWorkoutSets } from "@/lib/local";
import type { Exercise, WorkoutSet } from "@/lib/domain/types";
import { EndSheet } from "./end-sheet";
import { MoreSheet, type MoreSheetProps } from "./more-sheet";
import {
  buildPlan,
  resolveEquipment,
  setSwap,
  useWorkoutData,
  type PlanContext,
  type WorkoutData,
} from "./queries";
import { RestScreen } from "./rest-screen";
import { loadRest, saveRest, type RestState } from "./rest-state";
import { SessionDetail } from "./session-detail";
import { discardWorkout, removeSet, restoreSet, saveSetEdit, type SetEdit } from "./session-actions";
import { LoggerBar, SetEntryLoader, type EntryChrome, type Slot } from "./set-entry";
import { SetEditSheet, SwapSheet } from "./set-sheets";
import { ScreenSkeleton } from "./skeletons";
import {
  currentExerciseId,
  firstOpenIndex,
  groupByPlanned,
  nextToDo,
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
        Its sets do not count toward your plan.
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
  return <Logger data={data as WorkoutData & { ctx: PlanContext }} liveSets={sets} />;
}

/** The screen between exercises and at the very end: a name, a line, and the one thing to do next. */
function Between({
  chrome,
  title,
  line,
  action,
  onAction,
}: {
  chrome: EntryChrome;
  title: string;
  line?: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="pb-[calc(var(--live-band-height)+env(safe-area-inset-bottom)+16px)]">
      <LoggerBar {...chrome} />
      <h1 className="text-head font-medium">{title}</h1>
      {line ? <p className="mt-1.5 font-light">{line}</p> : null}
      <Button variant="live" pinned="bottom" onClick={onAction}>
        {action}
      </Button>
    </div>
  );
}

function Logger({ data, liveSets }: { data: WorkoutData & { ctx: PlanContext }; liveSets: WorkoutSet[] }) {
  const { workout, ctx, swaps } = data;
  const router = useRouter();
  const { toast } = useToast();

  const equipment = resolveEquipment(ctx, workout.equipment_profile_id);
  const plan = useMemo(() => buildPlan(ctx, equipment, workout.started_at), [ctx, equipment, workout.started_at]);
  const libraryById = useMemo(() => new Map(ctx.library.map((e) => [e.id, e])), [ctx.library]);

  // A set counts the moment it is saved, before the live read of the sets catches up. Without
  // this, the rest screen would name the set that was just done as the next one for a moment.
  const [pending, setPending] = useState<WorkoutSet | null>(null);
  if (pending && liveSets.some((s) => s.id === pending.id)) setPending(null);
  const sets = useMemo(
    () => (pending && !liveSets.some((s) => s.id === pending.id) ? [...liveSets, pending] : liveSets),
    [liveSets, pending],
  );
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
  const counts = useMemo(
    () => slots.map((s) => ({ id: s.item.planned.id, workSets: s.workSets, target: s.item.prescription.sets })),
    [slots],
  );

  // Until the lifter picks an exercise, the first one with sets left is the current one.
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const firstOpen = firstOpenIndex(counts);
  const openId = picked === undefined ? (slots[firstOpen]?.item.planned.id ?? null) : picked;
  const current = slots.find((s) => s.item.planned.id === openId) ?? null;
  const currentId = current?.item.planned.id ?? null;
  // Exercises that were asked for one more set after finishing their planned ones.
  const [extra, setExtra] = useState<string[]>([]);
  const currentDone = current !== null && current.workSets >= current.item.prescription.sets && !extra.includes(currentId ?? "");

  const [rest, setRest] = useState<RestState | null>(() => loadRest(workout.id));
  const endRest = useCallback(() => {
    setRest(null);
    saveRest(workout.id, null);
  }, [workout.id]);

  const [moreOpen, setMoreOpen] = useState(false);
  const [editing, setEditing] = useState<{ set: WorkoutSet; number: number } | null>(null);
  const [swapping, setSwapping] = useState<Slot | null>(null);
  const [endOpen, setEndOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const handleLogged = (slot: Slot, set: WorkoutSet) => {
    setPending(set);
    const work = !set.is_warmup;
    setAnnouncement(
      work ? `Set ${slot.workSets + 1} logged for ${slot.exercise.name}.` : `Warmup logged for ${slot.exercise.name}.`,
    );
    const plannedId = slot.item.planned.id;
    if (work) setExtra((ids) => ids.filter((id) => id !== plannedId));
    // The same exercise while it has sets left, then the next with sets left, then any that were skipped.
    const nextId = nextToDo(counts, plannedId, work);
    setPicked(nextId);
    // The last set of the workout has no rest after it: it goes straight to ending the workout.
    if (nextId === null) {
      setEndOpen(true);
      return;
    }
    const seconds = restSecondsFor(slot.item.planned, set.is_warmup);
    if (seconds > 0) {
      // The rest runs from the moment the set was saved.
      const started: RestState = { endsAt: Date.parse(set.completed_at) + seconds * 1000, total: seconds };
      setRest(started);
      saveRest(workout.id, started);
    }
  };

  // These throw on failure so the sheet can show the error where the lifter is looking.
  const saveEdit = async (set: WorkoutSet, edit: SetEdit) => {
    await saveSetEdit(set, edit);
    setEditing(null);
  };

  const deleteSet = async (set: WorkoutSet) => {
    await removeSet(set.id);
    setPending((p) => (p?.id === set.id ? null : p));
    setEditing(null);
    toast("Set deleted", { action: { label: "Undo", onClick: () => void restoreSet(set) } });
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
    await discardWorkout(workout);
    saveRest(workout.id, null);
    router.replace("/today");
  };

  const totals = sessionTotals(sets);
  const untrained = slots.filter((s) => s.workSets === 0).map((s) => s.exercise.name);
  const targetFor = (set: WorkoutSet) =>
    slots.find((s) => s.item.planned.id === set.planned_exercise_id)?.item.prescription.target_rir ?? 2;

  const chrome: EntryChrome = { onMore: () => setMoreOpen(true), onEnd: () => setEndOpen(true) };

  let workNumber = 0;
  const numbered = (current?.logged ?? []).map((set) => ({ set, number: set.is_warmup ? 0 : ++workNumber }));
  const moreProps: Omit<MoreSheetProps, "flags"> = {
    open: moreOpen,
    onClose: () => setMoreOpen(false),
    unit: ctx.unit,
    sets: numbered,
    slots,
    currentId,
    canAddSet: currentDone,
    onEditSet: (set, number) => {
      setMoreOpen(false);
      setEditing({ set, number });
    },
    onSwap: () => {
      setMoreOpen(false);
      setSwapping(current);
    },
    onPickExercise: (id) => {
      setMoreOpen(false);
      setPicked(id);
    },
    onAddSet: () => {
      setMoreOpen(false);
      if (currentId) setExtra((ids) => [...ids, currentId]);
    },
  };

  const nextAfterDone = currentDone && currentId ? nextToDo(counts, currentId, false) : null;
  const entry = slots.length > 0 && rest === null && current !== null && !currentDone;

  let body;
  if (slots.length === 0) {
    body = (
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
    );
  } else if (rest !== null) {
    body = (
      <RestScreen
        rest={rest}
        next={
          current
            ? { name: current.exercise.name, set: `Set ${current.workSets + 1} of ${current.item.prescription.sets}` }
            : null
        }
        onDone={endRest}
      />
    );
  } else if (current === null) {
    body = <Between chrome={chrome} title="All sets done." action="Finish workout" onAction={() => setEndOpen(true)} />;
  } else if (currentDone) {
    body = (
      <Between
        chrome={chrome}
        title={named(current.exercise.name)}
        line={`All ${current.item.prescription.sets} sets done.`}
        action={nextAfterDone ? "Next exercise" : "Finish workout"}
        onAction={() => (nextAfterDone ? setPicked(nextAfterDone) : setEndOpen(true))}
      />
    );
  } else {
    body = (
      <SetEntryLoader
        slot={current}
        workout={workout}
        equipment={equipment}
        unit={ctx.unit}
        chrome={chrome}
        onLogged={(set) => handleLogged(current, set)}
        more={(flags) => <MoreSheet {...moreProps} flags={flags} />}
      />
    );
  }

  return (
    <>
      {body}

      <p role="status" className="sr-only">
        {announcement}
      </p>

      {entry || rest !== null ? null : <MoreSheet {...moreProps} flags={null} />}

      <SetEditSheet
        set={editing?.set ?? null}
        setNumber={editing?.number ?? 0}
        exercise={editing ? libraryById.get(editing.set.exercise_id) : undefined}
        unit={ctx.unit}
        equipment={equipment}
        targetRir={editing ? targetFor(editing.set) : 2}
        onClose={() => setEditing(null)}
        onSave={saveEdit}
        onDelete={deleteSet}
      />

      <SwapSheet
        current={swapping?.exercise ?? null}
        library={ctx.library}
        equipment={equipment}
        onClose={() => setSwapping(null)}
        onPick={(exercise) => void pickSwap(exercise)}
      />

      <EndSheet
        open={endOpen}
        onClose={() => setEndOpen(false)}
        workSets={totals.workSets}
        untrained={untrained}
        onFinish={finish}
        onDiscard={discard}
      />
    </>
  );
}
