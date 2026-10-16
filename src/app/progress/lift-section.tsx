"use client";

import { useMemo, useState } from "react";
import { exerciseSeries, resolveBodyweight } from "@/lib/analytics";
import type { Exercise } from "@/lib/domain/types";
import { LineChart } from "@/components/charts";
import { ButtonLink, EmptyState, IconChevronDown, Segmented, Skeleton, named } from "@/components/ui";
import { useBodyMeasurements, useExerciseLibrary, useSetsForExercise, useWorkouts } from "@/lib/local";
import { num } from "@/lib/reports/format";
import {
  availableMetrics,
  exerciseOptions,
  figureGroups,
  metricDigits,
  metricUnit,
  seriesToLine,
  sessionFacts,
  trendFigure,
  trendSummary,
  type ExerciseOption,
  type Metric,
} from "./derive";
import { TrendStat } from "./trend-stat";
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
 * The lift name as the screen heading with a chevron. The platform picker sits invisibly on top of it,
 * so a tap opens the wheel everyone already knows.
 */
export function LiftPicker({ options, value, onChange }: { options: ExerciseOption[]; value: string; onChange: (id: string) => void }) {
  const current = options.find((o) => o.id === value) ?? options[0];
  return (
    <div className="relative flex min-h-11 items-center gap-2 text-head">
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
        Finish a workout and each exercise you log shows up here with its trend.
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
  const [metricPick, setMetricPick] = useState<Metric | null>(null);
  const [selectedPick, setSelectedPick] = useState<number | null>(null);

  const series = useMemo(() => {
    if (!sets || !workouts || !measurements) return null;
    const bodyweight =
      resolveBodyweight({ profile: { bodyweight: athlete.profileBodyweight }, measurements, asOf: athlete.today })?.value ?? null;
    return exerciseSeries({ exercise, workouts, sets, bodyweight, timeZone: athlete.timeZone });
  }, [sets, workouts, measurements, exercise, athlete.profileBodyweight, athlete.today, athlete.timeZone]);

  if (!series) return <Skeleton rows={4} />;
  if (series.length === 0) {
    return (
      <p className="mt-4">
        {`No finished sessions with work sets for ${exercise.name} yet. Sets in a workout you have not finished do not count.`}
      </p>
    );
  }

  const metrics = availableMetrics(exercise, series);
  const metric = metrics.find((m) => m.value === metricPick)?.value ?? metrics[0].value;
  const { points, source } = seriesToLine(series, metric);
  const index = Math.min(selectedPick ?? points.length - 1, points.length - 1);
  const unit = metricUnit(metric, athlete.unit);
  const digits = metricDigits(metric);
  const chosen = metrics.find((m) => m.value === metric) ?? metrics[0];
  const summary = trendSummary(points, unit, digits);
  const figure = trendFigure(points, unit, digits);

  return (
    <section aria-label="Lift trend" className="flex flex-col">
      {metrics.length > 1 ? (
        <Segmented
          label="Measure"
          className="-ml-2.5"
          value={metric}
          onChange={(m) => {
            setMetricPick(m);
            setSelectedPick(null);
          }}
          options={metrics}
        />
      ) : null}
      {points.length >= 2 ? (
        <>
          {figure && summary ? (
            <TrendStat
              value={figure.value}
              unit={figure.unit}
              lines={[`since ${figure.since}`, `over ${figure.sessions} sessions`]}
              summary={summary}
            />
          ) : null}
          <div className="mt-4">
            <LineChart
              points={points}
              selected={index}
              onSelect={setSelectedPick}
              label={`${exercise.name}, ${chosen.name} by session`}
              unit={unit}
              formatY={(y) => (digits === 0 ? y.toLocaleString("en-US", { maximumFractionDigits: 0 }) : num(y, digits))}
            />
          </div>
        </>
      ) : (
        <p className="mt-4">
          {points.length === 1
            ? `One session so far (${points[0].label}). A trend line needs at least two, so it will draw after your next one.`
            : `${chosen.label} cannot be worked out for these sessions. Try another measure.`}
        </p>
      )}
      {source[index] ? (
        <dl className="mt-3 border-b border-rule">
          {sessionFacts(source[index], exercise.load_type, athlete.unit).map((fact, i) =>
            i === 0 ? (
              <div key={fact.label} className="flex h-14 items-center justify-between gap-4 border-t border-rule">
                <dt>{fact.label}</dt>
                <dd className="flex items-baseline">
                  {figureGroups(fact.value).map((g, n) => (
                    <span key={n} className={`${g.figure ? "text-fig-32" : ""} ${n > 0 ? (g.figure ? "ml-2" : "ml-1") : ""}`}>
                      {g.text}
                    </span>
                  ))}
                </dd>
              </div>
            ) : (
              <div key={fact.label} className="flex min-h-11 items-baseline justify-between gap-4 border-t border-rule py-2.5">
                <dt>{fact.label}</dt>
                <dd className="text-right">{fact.value}</dd>
              </div>
            ),
          )}
        </dl>
      ) : null}
      <div className="mt-4 flex flex-col gap-2">
        <p className="text-why">One point per finished session. Warmups are left out.</p>
        {metric === "e1rm" ? (
          <p className="text-why">
            {`e1RM is the heaviest single you could lift, estimated from your best set with the Epley formula. Sets above 12 reps count as 12.${
              exercise.load_type === "external" ? "" : " For bodyweight lifts the weight is your bodyweight plus anything added."
            }`}
          </p>
        ) : null}
      </div>
    </section>
  );
}
