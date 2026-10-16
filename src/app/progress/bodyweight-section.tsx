"use client";

import { useMemo, useState } from "react";
import { addDays, bodyweightTrend } from "@/lib/analytics";
import { LineChart, type LinePoint } from "@/components/charts";
import { Section } from "@/components/coach/section";
import { ButtonLink, EmptyState, Skeleton } from "@/components/ui";
import { useBodyMeasurements } from "@/lib/local";
import { num, shortDate, signed } from "@/lib/reports/format";
import { signedFigure } from "./derive";
import { TrendStat } from "./trend-stat";
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
  if (!trend) body = <Skeleton rows={4} />;
  else if (trend.points.length === 0) {
    body = (
      <EmptyState
        title="No bodyweight logged"
        action={
          <ButtonLink href="/log" variant="primary" className="bleed">
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
    const first = trend.first as { date: string };
    body = (
      <div>
        {trend.change !== null ? (
          <TrendStat
            value={signedFigure(trend.change)}
            unit={unit}
            lines={[`since ${shortDate(first.date)}`, ...(trend.per_week !== null ? [`${signedFigure(trend.per_week)} ${unit} per week`] : [])]}
            summary={[
              `${signed(trend.change)} ${unit} since ${shortDate(first.date)}`,
              ...(trend.per_week !== null ? [`Trend of ${signed(trend.per_week)} ${unit} per week`] : []),
            ].join(". ")}
          />
        ) : null}
        <div className="mt-4">
          {points.length >= 2 ? (
            <LineChart points={points} selected={index} onSelect={setPick} label="Bodyweight by day" unit={unit} />
          ) : (
            <p>{`${num(points[0].y)} ${unit} on ${points[0].label}. Log another weigh-in and a trend line appears.`}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <Section title="Bodyweight" description={`Last ${RANGE_DAYS} days. One weigh-in per day; if you log twice, the latest edit counts.`}>
      {body}
    </Section>
  );
}
