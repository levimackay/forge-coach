"use client";

import { useMemo, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { ListGroup, ListRow } from "@/components/ui/list-row";
import { NumberStepper } from "@/components/ui/number-stepper";
import { Segmented } from "@/components/ui/segmented";
import { named } from "@/components/ui/name";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { ScreenBar } from "@/components/shell/screen-bar";
import { SyncChip } from "@/components/shell/sync-chip";
import {
  useActiveProgram,
  useEquipmentProfiles,
  useExerciseLibrary,
  useProfile,
  useSyncStatus,
  useWorkouts,
  type ActiveProgram,
} from "@/lib/local";
import { syncNow } from "@/lib/local/sync";
import type { EquipmentProfile, Exercise, PlannedExercise, Unit } from "@/lib/domain/types";
import { isUsable, loadIncrement, type EquipmentLike } from "@/lib/engine";
import type { PplVariant } from "@/lib/templates/ppl";
import { Chip, Figure, Notice, ScreenTitle, SectionTitle, SheetBand } from "./bits";
import { EQUIPMENT_NAME, MUSCLES, MUSCLE_LABEL, countLabel, formatNumber, formatPrescription } from "./format";
import {
  MAX_REPS,
  MAX_REST_SECONDS,
  MAX_RIR,
  MAX_SETS,
  addPlannedExercise,
  clampReps,
  movePlannedExercise,
  savePlannedEdit,
  setPlannedActive,
  swapPlannedExercise,
  type PlannedEdit,
} from "./program-actions";
import { createPplProgram } from "./program-build";
import { pickNextDay } from "./rotation";
import { ScreenSkeleton } from "./skeletons";
import { usesLoad } from "./workout-model";

export function ProgramScreen() {
  const active = useActiveProgram();
  const library = useExerciseLibrary();
  const equipment = useEquipmentProfiles();
  const workouts = useWorkouts({ limit: 40, status: "completed" });
  const profile = useProfile();
  const sync = useSyncStatus();
  const [pickedDay, setPickedDay] = useState<string | null>(null);

  if (
    active === undefined ||
    library === undefined ||
    equipment === undefined ||
    workouts === undefined ||
    profile === undefined
  ) {
    return <ScreenSkeleton rows={6} label="Loading your program" />;
  }
  if (active === null) {
    // The active program may still be on its way down; creating one now would make a second.
    if (!sync.hydrated) return <ScreenSkeleton rows={4} label="Loading your data" />;
    return <NoProgram library={library} equipment={equipment} />;
  }

  const nextDay = pickNextDay(active.days, workouts);
  const dayId = active.days.some((d) => d.id === pickedDay) ? pickedDay : (nextDay?.id ?? active.days[0]?.id ?? null);
  return (
    <ProgramView
      active={active}
      library={library}
      equipment={equipment}
      unit={profile?.unit ?? "lb"}
      dayId={dayId}
      onPickDay={setPickedDay}
    />
  );
}

function NoProgram({ library, equipment }: { library: Exercise[]; equipment: EquipmentProfile[] }) {
  const { toast } = useToast();
  const [variant, setVariant] = useState<PplVariant>("3day");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const profile = equipment.find((e) => e.id === profileId) ?? equipment[0];

  if (equipment.length === 0) {
    return (
      <EmptyState
        title="No program yet"
        action={
          <ButtonLink href="/onboarding" variant="primary" className="bleed">
            Set up FORGE
          </ButtonLink>
        }
      >
        Tell FORGE what equipment you have and it builds a push, pull, legs program for you.
      </EmptyState>
    );
  }

  const create = async () => {
    setBusy(true);
    try {
      await createPplProgram({ variant, equipment: profile, library });
    } catch (e) {
      toast(e instanceof Error ? e.message : "The program was not created. Try again.", { tone: "error" });
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-[var(--band-height)]">
      <div>
        <ScreenBar start={<SyncChip />} />
        <ScreenTitle title="Program">You do not have an active program. Build one from your equipment.</ScreenTitle>
      </div>
      {library.length === 0 ? (
        <Notice
          action={
            <Button variant="ghost" size="sm" onClick={() => void syncNow()}>
              Try again
            </Button>
          }
        >
          The exercise library has not downloaded yet. Connect once, then try again.
        </Notice>
      ) : null}
      <Segmented
        label="Training days per week"
        className="-ml-2.5"
        value={variant}
        onChange={setVariant}
        options={[
          { value: "3day", label: "3 days a week" },
          { value: "6day", label: "6 days a week" },
        ]}
      />
      {equipment.length > 1 ? (
        <div>
          <SectionTitle>Build it for</SectionTitle>
          <Segmented
            label="Build it for"
            className="-ml-2.5"
            value={profile.id}
            onChange={setProfileId}
            options={equipment.map((e) => ({ value: e.id, label: e.name }))}
          />
        </div>
      ) : null}
      <Button variant="primary" pinned="tabs" loading={busy} disabled={library.length === 0} onClick={() => void create()}>
        Create program
      </Button>
    </div>
  );
}

function ProgramView({
  active,
  library,
  equipment,
  unit,
  dayId,
  onPickDay,
}: {
  active: ActiveProgram;
  library: Exercise[];
  equipment: EquipmentProfile[];
  unit: Unit;
  dayId: string | null;
  onPickDay: (id: string) => void;
}) {
  const { toast } = useToast();
  const { program, days, planned } = active;
  const day = days.find((d) => d.id === dayId) ?? null;
  const libraryById = useMemo(() => new Map(library.map((e) => [e.id, e])), [library]);
  const items = useMemo(() => planned.filter((p) => p.program_day_id === day?.id), [planned, day]);
  const dayEquipment = equipment.find((e) => e.id === day?.equipment_profile_id) ?? equipment.find((e) => e.is_default) ?? null;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const editing = items.find((p) => p.id === editingId) ?? null;

  if (!day) return <EmptyState title="This program has no days" />;

  const add = async (exercise: Exercise) => {
    setAdding(false);
    try {
      await addPlannedExercise({ programDayId: day.id, exercise });
      toast(`${exercise.name} added to ${day.name}`);
    } catch {
      toast("The exercise was not added. Try again.", { tone: "error" });
    }
  };

  return (
    <div className="pb-4">
      <ScreenBar start={<SyncChip />} />
      <ScreenTitle title="Program">
        <p>
          {program.name}, {program.days_per_week} days a week
        </p>
        {program.notes ? <p className="pt-1">{program.notes}</p> : null}
      </ScreenTitle>

      <div role="group" aria-label="Program days" className="-mx-2.5 flex flex-wrap pb-2">
        {days.map((d) => (
          <Chip key={d.id} selected={d.id === day.id} onClick={() => onPickDay(d.id)}>
            {d.name}
          </Chip>
        ))}
      </div>

      <section aria-label={day.name}>
        <SectionTitle aside={`${countLabel(items.length, "exercise")}${dayEquipment ? `, ${dayEquipment.name}` : ""}`}>
          {day.name}
        </SectionTitle>
        {items.length === 0 ? (
          <p className="border-y border-rule py-3">No exercises on this day. Add one below.</p>
        ) : (
          <ListGroup label={`${day.name} exercises`} className="border-t border-rule">
            {items.map((p) => {
              const ex = libraryById.get(p.exercise_id);
              return (
                <ListRow
                  key={p.id}
                  title={named(ex?.name ?? "Exercise")}
                  name
                  subtitle={formatPrescription(p)}
                  trailing={
                    ex && usesLoad(ex) ? (
                      p.load !== null ? <Figure size={24} value={formatNumber(p.load)} unit={unit} /> : "No weight"
                    ) : undefined
                  }
                  onClick={() => setEditingId(p.id)}
                  chevron
                />
              );
            })}
          </ListGroup>
        )}
        <div className="pt-2">
          <Button variant="secondary" fullWidth onClick={() => setAdding(true)}>
            Add an exercise
          </Button>
        </div>
      </section>

      <p className="pt-6">
        Changes save as you make them. After each workout FORGE still adjusts weights and reps from what you lifted.
      </p>

      <PlannedEditSheet
        planned={editing}
        items={items}
        library={library}
        libraryById={libraryById}
        equipment={dayEquipment}
        unit={unit}
        onClose={() => setEditingId(null)}
      />

      <ExercisePickerSheet
        open={adding}
        title={`Add to ${day.name}`}
        library={library}
        equipment={dayEquipment}
        exclude={new Set(items.map((p) => p.exercise_id))}
        onClose={() => setAdding(false)}
        onPick={(e) => void add(e)}
      />
    </div>
  );
}

function PlannedEditSheet({
  planned,
  items,
  library,
  libraryById,
  equipment,
  unit,
  onClose,
}: {
  planned: PlannedExercise | null;
  items: PlannedExercise[];
  library: Exercise[];
  libraryById: Map<string, Exercise>;
  equipment: EquipmentLike | null;
  unit: Unit;
  onClose: () => void;
}) {
  const exercise = planned ? libraryById.get(planned.exercise_id) : undefined;
  return (
    <Sheet open={planned !== null} onClose={onClose} title={exercise?.name ?? "Edit exercise"}>
      {planned && exercise ? (
        <EditForm
          key={planned.id}
          planned={planned}
          exercise={exercise}
          items={items}
          library={library}
          equipment={equipment}
          unit={unit}
          onClose={onClose}
        />
      ) : null}
    </Sheet>
  );
}

function EditForm({
  planned,
  exercise,
  items,
  library,
  equipment,
  unit,
  onClose,
}: {
  planned: PlannedExercise;
  exercise: Exercise;
  items: PlannedExercise[];
  library: Exercise[];
  equipment: EquipmentLike | null;
  unit: Unit;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [edit, setEdit] = useState<PlannedEdit>({
    sets: planned.sets,
    rep_min: planned.rep_min,
    rep_max: planned.rep_max,
    target_rir: planned.target_rir,
    load: planned.load,
    rest_seconds: planned.rest_seconds,
  });
  const [swapping, setSwapping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const order = [...items].sort((a, b) => a.position - b.position);
  const index = order.findIndex((p) => p.id === planned.id);

  // Errors stay inside the sheet: a toast would sit behind the modal and never be seen.
  const run = async (action: () => Promise<unknown>, failure: string, close = true) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      if (close) onClose();
    } catch {
      setError(failure);
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    run(async () => {
      await setPlannedActive(planned, false);
      toast(`${exercise.name} removed`, { action: { label: "Undo", onClick: () => void setPlannedActive(planned, true) } });
    }, "The exercise was not removed. Try again.");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <NumberStepper
          label="Sets"
          value={edit.sets}
          min={1}
          max={MAX_SETS}
          onChange={(sets) => setEdit({ ...edit, sets })}
        />
        <NumberStepper
          label="Fewest reps"
          value={edit.rep_min}
          min={1}
          max={MAX_REPS}
          hint="The bottom of the rep range. Every set should reach it."
          onChange={(rep_min) => setEdit({ ...edit, ...clampReps({ rep_min }, edit) })}
        />
        <NumberStepper
          label="Most reps"
          value={edit.rep_max}
          min={1}
          max={MAX_REPS}
          hint="Reach it on every set and the weight goes up."
          onChange={(rep_max) => setEdit({ ...edit, ...clampReps({ rep_max }, edit) })}
        />
        <NumberStepper
          label="RIR"
          value={edit.target_rir}
          min={0}
          max={MAX_RIR}
          hint="Reps in reserve: how many reps to leave in the tank on each set."
          onChange={(target_rir) => setEdit({ ...edit, target_rir })}
        />
        {usesLoad(exercise) ? (
          <NumberStepper
            label={exercise.load_type === "assisted" ? "Assistance" : "Weight"}
            unit={unit}
            value={edit.load}
            step={loadIncrement(exercise, equipment, unit)}
            min={0}
            max={2000}
            onChange={(load) => setEdit({ ...edit, load })}
          />
        ) : null}
        <NumberStepper
          label="Rest"
          unit="s"
          value={edit.rest_seconds}
          step={15}
          min={0}
          max={MAX_REST_SECONDS}
          hint="Rest between sets."
          onChange={(rest_seconds) => setEdit({ ...edit, rest_seconds })}
        />
        <div className="border-t border-rule" />
      </div>

      <div>
        <SectionTitle>{`Position ${index + 1} of ${order.length}`}</SectionTitle>
        <div className="grid h-14 grid-cols-2 border-y border-rule">
          <button
            type="button"
            className="flex items-center justify-center underline decoration-1 underline-offset-4 active:bg-ink active:text-ground disabled:text-grey disabled:no-underline disabled:active:bg-transparent"
            disabled={busy || index <= 0}
            onClick={() => void run(() => movePlannedExercise(order, planned.id, -1), "The exercise was not moved.", false)}
          >
            Move up
          </button>
          <button
            type="button"
            className="flex items-center justify-center border-l border-rule underline decoration-1 underline-offset-4 active:bg-ink active:text-ground disabled:text-grey disabled:no-underline disabled:active:bg-transparent"
            disabled={busy || index === -1 || index >= order.length - 1}
            onClick={() => void run(() => movePlannedExercise(order, planned.id, 1), "The exercise was not moved.", false)}
          >
            Move down
          </button>
        </div>
        <ListRow title="Swap exercise" onClick={() => setSwapping(true)} disabled={busy} chevron />
        <ListRow title="Remove from this day" onClick={() => void remove()} disabled={busy} />
      </div>

      <SheetBand error={error}>
        <Button
          variant="primary"
          loading={busy}
          onClick={() => void run(() => savePlannedEdit(planned, edit), "The changes were not saved. Try again.")}
        >
          Save changes
        </Button>
      </SheetBand>

      <ExercisePickerSheet
        open={swapping}
        title={`Swap ${exercise.name}`}
        library={library}
        equipment={equipment}
        exclude={new Set([exercise.id])}
        note="Swapping clears the weight, because a weight belongs to its exercise."
        onClose={() => setSwapping(false)}
        onPick={(picked) => {
          setSwapping(false);
          void run(() => swapPlannedExercise(planned, picked), "The exercise was not swapped. Try again.");
        }}
      />
    </div>
  );
}

function ExercisePickerSheet({
  open,
  title,
  library,
  equipment,
  exclude,
  note,
  onClose,
  onPick,
}: {
  open: boolean;
  title: string;
  library: Exercise[];
  equipment: EquipmentLike | null;
  exclude: ReadonlySet<string>;
  note?: string;
  onClose: () => void;
  onPick: (exercise: Exercise) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <PickerBody library={library} equipment={equipment} exclude={exclude} note={note} onPick={onPick} />
    </Sheet>
  );
}

function PickerBody({
  library,
  equipment,
  exclude,
  note,
  onPick,
}: {
  library: Exercise[];
  equipment: EquipmentLike | null;
  exclude: ReadonlySet<string>;
  note?: string;
  onPick: (exercise: Exercise) => void;
}) {
  const [query, setQuery] = useState("");
  const [everything, setEverything] = useState(false);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = library.filter(
      (e) =>
        !e.deleted_at &&
        !exclude.has(e.id) &&
        (q === "" || e.name.toLowerCase().includes(q) || MUSCLE_LABEL[e.primary_muscle].toLowerCase().includes(q)) &&
        (everything || isUsable(e, equipment)),
    );
    return MUSCLES.map((muscle) => ({
      muscle,
      exercises: matches.filter((e) => e.primary_muscle === muscle).sort((a, b) => a.name.localeCompare(b.name)),
    })).filter((g) => g.exercises.length > 0);
  }, [library, equipment, exclude, query, everything]);

  return (
    <div className="flex flex-col gap-4 pb-2">
      {note ? <p>{note}</p> : null}
      <Field
        label="Search exercises"
        type="search"
        value={query}
        placeholder="Name or muscle"
        autoComplete="off"
        onChange={(e) => setQuery(e.target.value)}
      />
      {equipment ? (
        <div className="-mx-2.5">
          <Chip selected={everything} onClick={() => setEverything(!everything)}>
            Include exercises that need other equipment
          </Chip>
        </div>
      ) : null}
      {groups.length === 0 ? (
        <p>
          {everything || !equipment
            ? "No exercises match that search."
            : `No exercises match that search with the equipment at ${equipment.name}.`}
        </p>
      ) : (
        groups.map(({ muscle, exercises }) => (
          <div key={muscle}>
            <h3 className="pb-2 pt-2 text-name">{named(MUSCLE_LABEL[muscle])}</h3>
            <ListGroup label={MUSCLE_LABEL[muscle]} className="border-t border-rule">
              {exercises.map((e) => (
                <ListRow
                  key={e.id}
                  title={named(e.name)}
                  name
                  subtitle={
                    e.equipment.filter((c) => c !== "bodyweight").map((c) => EQUIPMENT_NAME[c]).join(", ") || "Bodyweight"
                  }
                  onClick={() => onPick(e)}
                />
              ))}
            </ListGroup>
          </div>
        ))
      )}
    </div>
  );
}
