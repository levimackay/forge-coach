"use client";

import { useMemo, useState } from "react";
import { exerciseSeries, resolveBodyweight } from "@/lib/analytics";
import type { Exercise } from "@/lib/domain/types";
import { LineChart } from "@/components/charts";
import { NativeSelect } from "@/components/coach/native-select";
import { Panel, Section } from "@/components/coach/section";
import { ButtonLink, EmptyState, Segmented, Skeleton } from "@/components/ui";
import { useBodyMeasurements, useExerciseLibrary, useSetsForExercise, useWorkouts } from "@/lib/local";
import { num } from "@/lib/reports/format";
import {
  availableMetrics,
  exerciseOptions,
  metricDigits,
  metricUnit,
  seriesToLine,
  sessionFacts,
  trendSummary,
  type Metric,
} from "./derive";
import { useTrainedKeys, type Athlete } from "./use-progress-data";

export function LiftSection({ athlete }: { athlete: Athlete }) {
  const library = useExerciseLibrary();
  const keys = useTrainedKeys();
  const [picked, setPicked] = useState<string | null>(null);

  const options = useMemo(() => (library && keys ? exerciseOptions(keys, library) : undefined), [library, keys]);

  let body;
  if (!options || !library) {
    body = <Skeleton className="h-64 w-full" />;
  } else if (options.length === 0) {
    body = (
      <EmptyState
        title="No lifts logged yet"
        action={
          <ButtonLink href="/today" variant="primary">
            Go to today
          </ButtonLink>
        }
      >
        Finish a workout and each exercise you log shows up here with its trend.
      </EmptyState>
    );
  } else {
    const id = options.some((o) => o.id === picked) ? (picked as string) : options[0].id;
    const exercise = library.find((e) => e.id === id) as Exercise;
    body = (
      <div className="flex flex-col gap-4">
        <NativeSelect label="Exercise" value={id} onChange={setPicked} options={options.map((o) => ({ value: o.id, label: o.name }))} />
        <LiftTrend key={id} exercise={exercise} athlete={athlete} />
      </div>
    );
  }

  return (
    <Section title="Lift trend" description="One point per finished session. Warmups are left out.">
      {body}
    </Section>
  );
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

  if (!series) return <Skeleton className="h-64 w-full" />;
  if (series.length === 0) {
    return (
      <Panel>
        <p className="text-[17px] text-ink-dim">
          {`No finished sessions with work sets for ${exercise.name} yet. Sets in a workout you have not finished do not count.`}
        </p>
      </Panel>
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

  return (
    <div className="flex flex-col gap-4">
      {metrics.length > 1 ? (
        <Segmented
          label="Measure"
          value={metric}
          onChange={(m) => {
            setMetricPick(m);
            setSelectedPick(null);
          }}
          options={metrics}
        />
      ) : null}
      <Panel className="flex flex-col gap-4">
        {points.length >= 2 ? (
          <>
            <LineChart
              points={points}
              selected={index}
              onSelect={setSelectedPick}
              label={`${exercise.name}, ${chosen.name} by session`}
              unit={unit}
              formatY={(y) => (digits === 0 ? y.toLocaleString("en-US", { maximumFractionDigits: 0 }) : num(y, digits))}
            />
            {summary ? <p className="text-[15px] text-ink-dim">{summary}</p> : null}
          </>
        ) : (
          <p className="text-[17px] text-ink-dim">
            {points.length === 1
              ? `One session so far (${points[0].label}). A trend line needs at least two, so it will draw after your next one.`
              : `${chosen.label} cannot be worked out for these sessions. Try another measure.`}
          </p>
        )}
        {metric === "e1rm" ? (
          <p className="text-[15px] text-ink-faint">
            {`e1RM is the heaviest single you could lift, estimated from your best set with the Epley formula. Sets above 12 reps count as 12.${
              exercise.load_type === "external" ? "" : " For bodyweight lifts the weight is your bodyweight plus anything added."
            }`}
          </p>
        ) : null}
        {source[index] ? (
          <ul className="flex flex-col gap-1 border-t border-line pt-3 text-[15px] text-ink-dim">
            {sessionFacts(source[index], exercise.load_type, athlete.unit).map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        ) : null}
      </Panel>
    </div>
  );
}
