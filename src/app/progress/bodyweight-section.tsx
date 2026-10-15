"use client";

import { useMemo, useState } from "react";
import { addDays, bodyweightTrend } from "@/lib/analytics";
import { LineChart, type LinePoint } from "@/components/charts";
import { Panel, Section } from "@/components/coach/section";
import { ButtonLink, EmptyState, Skeleton } from "@/components/ui";
import { useBodyMeasurements } from "@/lib/local";
import { num, shortDate, signed } from "@/lib/reports/format";
import type { Athlete } from "./use-progress-data";

const RANGE_DAYS = 90;

export function BodyweightSection({ athlete }: { athlete: Athlete }) {
  const measurements = useBodyMeasurements();
  const [pick, setPick] = useState<number | null>(null);

  const trend = useMemo(
    () =>
      measurements
        ? bodyweightTrend({ measurements, range: { from: addDays(athlete.today, -RANGE_DAYS), to: athlete.today } })
        : null,
    [measurements, athlete.today],
  );

  let body;
  if (!trend) body = <Skeleton className="h-56 w-full" />;
  else if (trend.points.length === 0) {
    body = (
      <EmptyState
        title="No bodyweight logged"
        action={
          <ButtonLink href="/log" variant="primary">
            Log your weight
          </ButtonLink>
        }
      >
        {`Weigh in a few times and the trend for the last ${RANGE_DAYS} days shows here.`}
      </EmptyState>
    );
  } else {
    const points: LinePoint[] = trend.points.map((p) => ({ x: Date.parse(`${p.date}T00:00:00Z`), y: p.bodyweight, label: shortDate(p.date) }));
    const index = Math.min(pick ?? points.length - 1, points.length - 1);
    const unit = athlete.unit;
    body = (
      <Panel className="flex flex-col gap-4">
        {points.length >= 2 ? (
          <LineChart points={points} selected={index} onSelect={setPick} label="Bodyweight by day" unit={unit} />
        ) : (
          <p className="text-[17px] text-ink-dim">
            {`${num(points[0].y)} ${unit} on ${points[0].label}. Log another weigh-in and a trend line appears.`}
          </p>
        )}
        {trend.change !== null ? (
          <ul className="flex flex-col gap-1 border-t border-line pt-3 text-[15px] text-ink-dim">
            <li>{`${signed(trend.change)} ${unit} since ${shortDate((trend.first as { date: string }).date)}`}</li>
            {trend.per_week !== null ? <li>{`Trend of ${signed(trend.per_week)} ${unit} per week`}</li> : null}
          </ul>
        ) : null}
      </Panel>
    );
  }

  return (
    <Section title="Bodyweight" description={`Last ${RANGE_DAYS} days. One weigh-in per day; if you log twice, the latest edit counts.`}>
      {body}
    </Section>
  );
}
