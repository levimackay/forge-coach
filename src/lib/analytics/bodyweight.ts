import type { BodyMeasurement, IsoDate, Profile } from "@/lib/domain/types";
import { daysBetween, inRange, time } from "./dates";

export interface BodyweightPoint {
  date: IsoDate;
  bodyweight: number;
}

export interface BodyweightTrend {
  points: BodyweightPoint[];
  first: BodyweightPoint | null;
  latest: BodyweightPoint | null;
  /** latest minus first. Null with fewer than 2 points. */
  change: number | null;
  /** Least-squares slope per 7 days. Null unless the points span at least 7 days. */
  per_week: number | null;
}

export function bodyweightTrend(input: { measurements: BodyMeasurement[]; range?: { from: IsoDate; to: IsoDate } }): BodyweightTrend {
  // One reading per day: the most recently edited wins.
  const byDate = new Map<IsoDate, BodyMeasurement>();
  for (const m of input.measurements) {
    if (m.deleted_at || m.bodyweight === null || !(m.bodyweight > 0)) continue;
    if (input.range && !inRange(m.measured_on, input.range.from, input.range.to)) continue;
    const kept = byDate.get(m.measured_on);
    if (!kept || time(m.updated_at) >= time(kept.updated_at)) byDate.set(m.measured_on, m);
  }
  const points = [...byDate.values()]
    .map((m) => ({ date: m.measured_on, bodyweight: m.bodyweight as number }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const first = points[0] ?? null;
  const latest = points[points.length - 1] ?? null;
  const span = first && latest ? daysBetween(first.date, latest.date) : 0;

  let per_week: number | null = null;
  if (points.length >= 2 && span >= 7) {
    const xs = points.map((p) => daysBetween((first as BodyweightPoint).date, p.date));
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = points.reduce((a, p) => a + p.bodyweight, 0) / points.length;
    const sxy = xs.reduce((a, x, i) => a + (x - mx) * (points[i].bodyweight - my), 0);
    const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
    per_week = (sxy / sxx) * 7;
  }

  return { points, first, latest, change: points.length >= 2 ? (latest as BodyweightPoint).bodyweight - (first as BodyweightPoint).bodyweight : null, per_week };
}

export interface ResolvedBodyweight {
  value: number;
  source: "measurement" | "profile";
  date: IsoDate | null;
}

/** Newest measurement on or before `asOf`, else the profile's bodyweight, else unknown. */
export function resolveBodyweight(input: {
  profile: Pick<Profile, "bodyweight"> | null;
  measurements: BodyMeasurement[];
  asOf: IsoDate;
}): ResolvedBodyweight | null {
  const latest = bodyweightTrend({ measurements: input.measurements.filter((m) => m.measured_on <= input.asOf) }).latest;
  if (latest) return { value: latest.bodyweight, source: "measurement", date: latest.date };
  const fromProfile = input.profile?.bodyweight;
  return fromProfile && fromProfile > 0 ? { value: fromProfile, source: "profile", date: null } : null;
}
