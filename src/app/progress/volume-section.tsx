"use client";

import { useMemo, useState } from "react";
import { VOLUME_REFERENCE, weeklyHardSets, HARD_SET_MAX_RIR } from "@/lib/analytics";
import { BandBars } from "@/components/charts";
import { Panel, Section } from "@/components/coach/section";
import { Segmented, Skeleton } from "@/components/ui";
import { useExerciseLibrary } from "@/lib/local";
import { shortDate } from "@/lib/reports/format";
import { volumeRows, weekWindows } from "./derive";
import { useTrainingWindow, type Athlete } from "./use-progress-data";

type Offset = "0" | "1" | "2";

const OPTIONS: { value: Offset; label: string }[] = [
  { value: "0", label: "This week" },
  { value: "1", label: "Last week" },
  { value: "2", label: "2 wk ago" },
];

// Three weeks of rows plus a week of slack so a late-night session near a boundary is never cut off.
const WINDOW_DAYS = 28;

export function VolumeSection({ athlete }: { athlete: Athlete }) {
  const library = useExerciseLibrary();
  const training = useTrainingWindow(WINDOW_DAYS);
  const [offset, setOffset] = useState<Offset>("0");

  const week = useMemo(() => {
    const windows = weekWindows(athlete.today, 3);
    return windows[windows.length - 1 - Number(offset)];
  }, [athlete.today, offset]);

  const result = useMemo(() => {
    if (!library || !training) return null;
    return volumeRows(
      weeklyHardSets({ workouts: training.workouts, sets: training.sets, exercises: library, weekStart: week.from, timeZone: athlete.timeZone }),
    );
  }, [library, training, week.from, athlete.timeZone]);

  return (
    <Section
      title="Weekly hard sets"
      description={`Per muscle, Monday to Sunday. The shaded band is ${VOLUME_REFERENCE.min} to ${VOLUME_REFERENCE.max} sets, a common working range.`}
    >
      <Segmented label="Week" value={offset} onChange={setOffset} options={OPTIONS} />
      <Panel className="flex flex-col gap-4">
        <p className="text-[15px] text-ink-dim">
          {`${shortDate(week.from)} to ${shortDate(week.to)}${offset === "0" ? ". This week is still in progress." : ""}`}
        </p>
        {!result ? (
          <Skeleton className="h-48 w-full" />
        ) : result.rows.length === 0 ? (
          <p className="text-[17px] text-ink-dim">
            {offset === "0"
              ? "No finished work sets this week yet. They show up here once you complete a workout."
              : "No finished work sets in this week."}
          </p>
        ) : (
          <>
            <BandBars label={`Hard sets per muscle, ${shortDate(week.from)} to ${shortDate(week.to)}`} band={VOLUME_REFERENCE} rows={result.rows} />
            {result.untrained.length > 0 ? (
              <p className="text-[15px] text-ink-dim">{`No hard sets for ${result.untrained.join(", ").toLowerCase()}.`}</p>
            ) : null}
          </>
        )}
        <p className="border-t border-line pt-3 text-[15px] text-ink-faint">
          {`A hard set is a work set with ${HARD_SET_MAX_RIR} or fewer reps in reserve, or no reps in reserve logged. A muscle that only assists in an exercise gets half a set.`}
        </p>
      </Panel>
    </Section>
  );
}
