"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list-row";
import { sessionMinutes } from "@/lib/analytics";
import { ScreenTitle, SectionTitle } from "./bits";
import { countLabel, formatDate, formatDuration, formatMonth } from "./format";
import { useHistory, type HistoryRow } from "./queries";
import { ScreenSkeleton } from "./skeletons";

const PAGE = 30;

export function HistoryScreen() {
  const [limit, setLimit] = useState(PAGE);
  const history = useHistory(limit);

  if (history === undefined) return <ScreenSkeleton rows={6} label="Loading history" />;

  if (history.total === 0) {
    return (
      <>
        <ScreenTitle title="History" />
        <EmptyState
          title="No finished workouts yet"
          action={
            <ButtonLink href="/today" variant="primary" size="lg">
              Go to Today
            </ButtonLink>
          }
        >
          Finish a workout and it shows up here with every set and what the plan will change next.
        </EmptyState>
      </>
    );
  }

  // Rows arrive newest first, so months come out in order.
  const months: { label: string; rows: HistoryRow[] }[] = [];
  for (const row of history.rows) {
    const label = formatMonth(row.workout.started_at);
    const current = months[months.length - 1];
    if (current?.label === label) current.rows.push(row);
    else months.push({ label, rows: [row] });
  }

  return (
    <div className="flex flex-col gap-5 pb-4">
      <ScreenTitle title="History">{countLabel(history.total, "finished workout")}</ScreenTitle>
      {months.map((month) => (
        <section key={month.label} className="flex flex-col gap-1">
          <SectionTitle>{month.label}</SectionTitle>
          <ListGroup label={month.label}>
            {month.rows.map(({ workout, dayName, workSets }) => {
              const minutes = sessionMinutes(workout);
              return (
                <ListRow
                  key={workout.id}
                  title={dayName ?? "Workout"}
                  subtitle={`${formatDate(workout.started_at)}${minutes !== null ? `, ${formatDuration(minutes)}` : ""}`}
                  trailing={countLabel(workSets, "set")}
                  href={`/history/session?id=${workout.id}`}
                />
              );
            })}
          </ListGroup>
        </section>
      ))}
      {history.total > history.rows.length ? (
        <Button variant="secondary" fullWidth onClick={() => setLimit(limit + PAGE)}>
          Show older workouts
        </Button>
      ) : null}
    </div>
  );
}
