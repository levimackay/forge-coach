"use client";

import { useMemo } from "react";
import { WeekColumns } from "@/components/charts";
import { Section } from "@/components/coach/section";
import { ButtonLink, EmptyState, Skeleton } from "@/components/ui";
import { useActiveProgram, useWorkouts } from "@/lib/local";
import { consistencyColumns } from "./derive";
import type { Athlete } from "./use-progress-data";

const WEEKS = 8;

export function ConsistencySection({ athlete }: { athlete: Athlete }) {
  const workouts = useWorkouts({ limit: 400 });
  const program = useActiveProgram();

  const result = useMemo(() => {
    if (!workouts || program === undefined) return null;
    return consistencyColumns({
      workouts,
      daysPerWeek: program?.program.days_per_week ?? null,
      today: athlete.today,
      timeZone: athlete.timeZone,
      weeks: WEEKS,
    });
  }, [workouts, program, athlete.today, athlete.timeZone]);

  const nothingYet = workouts !== undefined && !workouts.some((w) => w.status === "completed");

  let body;
  if (!result) body = <Skeleton rows={3} />;
  else if (nothingYet) {
    body = (
      <EmptyState
        title="No finished workouts yet"
        action={
          <ButtonLink href="/today" variant="primary" className="bleed">
            Go to today
          </ButtonLink>
        }
      >
        Your weekly sessions are charted here after your first workout.
      </EmptyState>
    );
  } else {
    const summary =
      result.finishedWeeks === 0
        ? null
        : result.finishedPlanned === null
          ? `${result.finishedCompleted} sessions across the last ${result.finishedWeeks} full weeks. There is no active program to compare with.`
          : `${result.finishedCompleted} of ${result.finishedPlanned} planned sessions across the last ${result.finishedWeeks} full weeks.`;
    body = (
      <>
        <WeekColumns weeks={result.columns} label="Finished sessions per week, oldest first" />
        <p className="text-why">
          {result.columns[0].planned === null
            ? "Each column is the sessions you finished that week."
            : "Each column is the sessions you finished that week. The line across it is how many your program plans."}
        </p>
        {summary ? <p className="border-t border-rule pt-3">{summary}</p> : null}
      </>
    );
  }

  return (
    <Section title="Consistency" description={`Sessions per week for the last ${WEEKS} weeks, weeks starting Monday.`}>
      {body}
    </Section>
  );
}
