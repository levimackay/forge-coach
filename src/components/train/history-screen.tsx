"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list-row";
import { named } from "@/components/ui/name";
import { ScreenBar } from "@/components/shell/screen-bar";
import { ScreenTitle, SectionTitle } from "./bits";
import { formatMonth, formatMonthDay } from "./format";
import { useHistory, type HistoryRow } from "./queries";
import { ScreenSkeleton } from "./skeletons";

const PAGE = 30;

const back = (
  <ButtonLink href="/more" variant="ghost" size="sm" className="-ml-2">
    Back
  </ButtonLink>
);

export function HistoryScreen() {
  const [limit, setLimit] = useState(PAGE);
  const history = useHistory(limit);

  if (history === undefined) return <ScreenSkeleton rows={6} label="Loading history" />;

  if (history.total === 0) {
    return (
      <>
        <ScreenBar start={back} />
        <ScreenTitle title="History" />
        <EmptyState
          title="No workouts yet"
          action={
            <ButtonLink href="/today" variant="primary" className="bleed">
              Go to Today
            </ButtonLink>
          }
        />
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
      <ScreenBar start={back} />
      <ScreenTitle title="History" />
      {months.map((month) => (
        <section key={month.label}>
          <SectionTitle>{month.label}</SectionTitle>
          <ListGroup label={month.label} className="border-t border-rule">
            {month.rows.map(({ workout, dayName }) => (
              <ListRow
                key={workout.id}
                label={formatMonthDay(workout.started_at)}
                title={named(dayName ?? "Workout")}
                name
                href={`/history/session?id=${workout.id}`}
              />
            ))}
          </ListGroup>
        </section>
      ))}
      {history.total > history.rows.length ? (
        <div className="pt-4">
          <Button variant="secondary" fullWidth onClick={() => setLimit(limit + PAGE)}>
            Show older
          </Button>
        </div>
      ) : null}
    </div>
  );
}
