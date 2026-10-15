"use client";

import { useMemo } from "react";
import { WeekColumns } from "@/components/charts";
import { Panel, Section } from "@/components/coach/section";
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
  if (!result) body = <Skeleton className="h-44 w-full" />;
  else if (nothingYet) {
    body = (
      <EmptyState
        title="No finished workouts yet"
        action={
          <ButtonLink href="/today" variant="primary">
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
      <Panel className="flex flex-col gap-4">
        <WeekColumns weeks={result.columns} label="Finished sessions per week, oldest first" />
        <p className="text-[15px] text-ink-dim">
          {result.columns[0].planned === null
            ? "Each column is the sessions you finished that week."
            : "Each column is the sessions you finished that week. The white line is how many your program plans."}
        </p>
        {summary ? <p className="border-t border-line pt-3 text-[17px] text-ink">{summary}</p> : null}
      </Panel>
    );
  }

  return (
    <Section title="Consistency" description={`Sessions per week for the last ${WEEKS} weeks, weeks starting Monday.`}>
      {body}
    </Section>
  );
}
