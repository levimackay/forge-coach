"use client";

import { useMemo, useState } from "react";
import { exerciseSeries, resolveBodyweight } from "@/lib/analytics";
import type { Exercise } from "@/lib/domain/types";
import { LineChart } from "@/components/charts";
import { ButtonLink, EmptyState, IconChevronDown, Skeleton, named } from "@/components/ui";
import { useBodyMeasurements, useExerciseLibrary, useSetsForExercise, useWorkouts } from "@/lib/local";
import {
  MEASURE_LABEL,
  exerciseOptions,
  headlineMeasure,
  seriesToLine,
  shown,
  sinceText,
  type ExerciseOption,
} from "./derive";
import { useTrainedKeys, type Athlete } from "./use-progress-data";

/** The exercises with logged sets and the one on screen. `exercise` is undefined until the library has loaded. */
export function useLiftChoice() {
  const library = useExerciseLibrary();
  const keys = useTrainedKeys();
  const [picked, setPicked] = useState<string | null>(null);

  const options = useMemo(() => (library && keys ? exerciseOptions(keys, library) : undefined), [library, keys]);
  const id = options && options.length > 0 ? (options.some((o) => o.id === picked) ? (picked as string) : options[0].id) : null;
  const exercise = id && library ? library.find((e) => e.id === id) : undefined;
  return { options, id, exercise, pick: setPicked };
}

export type LiftChoice = ReturnType<typeof useLiftChoice>;

/**
 * The lift name as the screen title with a chevron. The platform picker sits invisibly on top of it,
 * so a tap opens the wheel everyone already knows.
 */
export function LiftPicker({ options, value, onChange }: { options: ExerciseOption[]; value: string; onChange: (id: string) => void }) {
  const current = options.find((o) => o.id === value) ?? options[0];
  return (
    <div className="relative flex min-h-11 items-center gap-2 text-head font-medium">
      <span aria-hidden="true" className="min-w-0 truncate">
        {named(current.name)}
      </span>
      <IconChevronDown size={16} strokeWidth={1.5} className="shrink-0" />
      <select
        aria-label="Exercise"
        name="exercise"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent text-transparent [&_option]:bg-ground [&_option]:text-ink"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function LiftSection({ athlete, lift }: { athlete: Athlete; lift: LiftChoice }) {
  if (!lift.options) return <Skeleton rows={4} />;
  if (lift.options.length === 0) {
    return (
      <EmptyState
        title="No lifts logged yet"
        action={
          <ButtonLink href="/today" variant="primary" className="bleed">
            Go to today
          </ButtonLink>
        }
      >
        Finish a workout and your lifts show up here.
      </EmptyState>
    );
  }
  if (!lift.exercise) return <Skeleton rows={4} />;
  return <LiftTrend key={lift.exercise.id} exercise={lift.exercise} athlete={athlete} />;
}

function LiftTrend({ exercise, athlete }: { exercise: Exercise; athlete: Athlete }) {
  const sets = useSetsForExercise(exercise.id, 1500);
  const workouts = useWorkouts({ status: "completed", limit: 1000 });
  const measurements = useBodyMeasurements();

  const series = useMemo(() => {
    if (!sets || !workouts || !measurements) return null;
    const bodyweight =
      resolveBodyweight({ profile: { bodyweight: athlete.profileBodyweight }, measurements, asOf: athlete.today })?.value ?? null;
    return exerciseSeries({ exercise, workouts, sets, bodyweight, timeZone: athlete.timeZone });
  }, [sets, workouts, measurements, exercise, athlete.profileBodyweight, athlete.today, athlete.timeZone]);

  if (!series) return <Skeleton rows={4} />;
  if (series.length === 0) return <p className="mt-8">{`No finished workouts with ${exercise.name} yet.`}</p>;

  const measure = headlineMeasure(exercise, series);
  const points = seriesToLine(series, measure);
  const unit = measure === "reps" ? "reps" : athlete.unit;
  const since = sinceText(points, measure, athlete.unit);

  return (
    <section aria-label="Lift trend" className="mt-6 flex flex-col text-word">
      <p className="font-light">{MEASURE_LABEL[measure]}</p>
      <p className="-ml-1.5 mt-2.5 flex items-baseline">
        <span className="text-fig-112">{shown(points[points.length - 1].y)}</span>
        <span className="ml-1">{unit}</span>
      </p>
      <p className="mt-3">{since ?? "One workout so far."}</p>
      {points.length >= 2 ? (
        <div className="mt-3.5">
          <LineChart points={points} label={`${exercise.name}, ${MEASURE_LABEL[measure].toLowerCase()} by workout`} unit={unit} formatY={shown} />
        </div>
      ) : null}
    </section>
  );
}
