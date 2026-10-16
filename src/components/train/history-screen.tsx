"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list-row";
import { named } from "@/components/ui/name";
import { ScreenBar } from "@/components/shell/screen-bar";
import { SyncChip } from "@/components/shell/sync-chip";
import { sessionMinutes } from "@/lib/analytics";
import { Figure, ScreenTitle } from "./bits";
import { countLabel, formatDuration, formatMonth, formatMonthDay, formatWeekday } from "./format";
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
        <ScreenBar start={<SyncChip />} />
        <ScreenTitle title="History" />
        <EmptyState
          title="No finished workouts yet"
          action={
            <ButtonLink href="/today" variant="primary" className="bleed">
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
    <div className="pb-4">
      <ScreenBar start={<SyncChip />} />
      <ScreenTitle title="History">{countLabel(history.total, "finished workout")}</ScreenTitle>
      {months.map((month) => (
        <section key={month.label}>
          <h2 className="pb-2 pt-6 text-head">{month.label}</h2>
          <ListGroup label={month.label} className="border-t border-rule">
            {month.rows.map(({ workout, dayName, workSets }) => {
              const minutes = sessionMinutes(workout);
              return (
                <ListRow
                  key={workout.id}
                  label={formatMonthDay(workout.started_at)}
                  title={named(dayName ?? "Workout")}
                  name
                  subtitle={`${formatWeekday(workout.started_at)}${minutes !== null ? `, ${formatDuration(minutes)}` : ""}`}
                  trailing={<Figure size={24} value={String(workSets)} unit={workSets === 1 ? "set" : "sets"} />}
                  href={`/history/session?id=${workout.id}`}
                />
              );
            })}
          </ListGroup>
        </section>
      ))}
      {history.total > history.rows.length ? (
        <div className="pt-4">
          <Button variant="secondary" fullWidth onClick={() => setLimit(limit + PAGE)}>
            Show older workouts
          </Button>
        </div>
      ) : null}
    </div>
  );
}
