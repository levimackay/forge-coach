import type { Exercise, IsoDate, Unit, Workout } from "@/lib/domain/types";
import { E1RM_REP_CAP, addDays, consistency, weekStart, type DecisionItem, type MuscleVolume, type SeriesPoint } from "@/lib/analytics";
import type { BandRow, LinePoint, WeekColumn } from "@/components/charts";
import { prescriptionRows, type DiffContext, type DiffRow } from "@/components/coach/diff";
import { sentence } from "@/components/coach/format";
import { num, shortDate } from "@/lib/reports/format";

/** Seven day windows, oldest first, the last one holding `today`. Weeks start on Monday. */
export function weekWindows(today: IsoDate, count: number): { from: IsoDate; to: IsoDate }[] {
  const current = weekStart(today);
  return Array.from({ length: count }, (_, i) => {
    const from = addDays(current, -7 * (count - 1 - i));
    return { from, to: addDays(from, 6) };
  });
}

export interface ConsistencySummary {
  columns: WeekColumn[];
  /** Finished weeks only; the current week is still being trained. */
  finishedCompleted: number;
  finishedPlanned: number | null;
  finishedWeeks: number;
}

export function consistencyColumns(input: {
  workouts: Workout[];
  daysPerWeek: number | null;
  today: IsoDate;
  timeZone: string;
  weeks: number;
}): ConsistencySummary {
  const columns: WeekColumn[] = [];
  let finishedCompleted = 0;
  let finishedWeeks = 0;
  for (const w of weekWindows(input.today, input.weeks)) {
    const c = consistency({ workouts: input.workouts, daysPerWeek: input.daysPerWeek, from: w.from, to: w.to, timeZone: input.timeZone });
    const inProgress = w.to >= input.today;
    columns.push({ key: w.from, label: shortDate(w.from), completed: c.completed, planned: input.daysPerWeek, inProgress });
    if (!inProgress) {
      finishedCompleted += c.completed;
      finishedWeeks += 1;
    }
  }
  return {
    columns,
    finishedCompleted,
    finishedPlanned: input.daysPerWeek === null ? null : input.daysPerWeek * finishedWeeks,
    finishedWeeks,
  };
}

export interface ExerciseOption {
  id: string;
  name: string;
  lastAt: string;
}

/** Exercises that have logged sets, most recently trained first. `keys` are [exercise_id, completed_at] index keys. */
export function exerciseOptions(keys: readonly (readonly [string, string])[], library: readonly Exercise[]): ExerciseOption[] {
  const last = new Map<string, string>();
  for (const [id, at] of keys) if (!last.has(id) || at > (last.get(id) as string)) last.set(id, at);
  const byId = new Map(library.map((e) => [e.id, e]));
  return [...last]
    .flatMap(([id, lastAt]) => {
      const exercise = byId.get(id);
      return exercise ? [{ id, name: exercise.name, lastAt }] : [];
    })
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt) || a.name.localeCompare(b.name));
}

export type Metric = "e1rm" | "load" | "reps" | "volume";

const metricValue = (p: SeriesPoint, metric: Metric): number | null => {
  switch (metric) {
    case "e1rm":
      return p.top_e1rm;
    case "load":
      return p.top_load !== null && p.top_load > 0 ? p.top_load : null;
    case "reps":
      return p.max_reps;
    case "volume":
      return p.volume_load;
  }
};

export interface MetricChoice {
  value: Metric;
  /** Short enough for a segment on a phone. */
  label: string;
  /** Full name, for the chart's accessible label. */
  name: string;
}

/**
 * The metrics worth charting for this exercise, the default first. An estimated max for plain bodyweight work
 * would only restate reps, so it is offered once weight is added. When most sessions go past the e1RM rep cap,
 * added reps do not move the estimate, so reps come first.
 */
export function availableMetrics(exercise: Pick<Exercise, "load_type">, series: readonly SeriesPoint[]): MetricChoice[] {
  const has = (m: Metric) => series.some((p) => metricValue(p, m) !== null);
  const addedLoad = has("load");
  const out: MetricChoice[] = [];
  if (has("e1rm") && (exercise.load_type === "external" || addedLoad)) {
    out.push({ value: "e1rm", label: "e1RM", name: "estimated one rep max" });
  }
  if (addedLoad) {
    const name = exercise.load_type === "external" ? "top load" : exercise.load_type === "bodyweight" ? "added load" : "assistance";
    out.push({ value: "load", label: "Load", name });
  }
  const reps: MetricChoice = { value: "reps", label: "Reps", name: "best set reps" };
  const highRep = series.filter((p) => p.max_reps > E1RM_REP_CAP).length * 2 > series.length;
  if (highRep) out.unshift(reps);
  else out.push(reps);
  if (has("volume")) out.push({ value: "volume", label: "Volume", name: "total volume" });
  return out;
}

export function metricUnit(metric: Metric, unit: Unit): string {
  return metric === "reps" ? "reps" : unit;
}

export function metricDigits(metric: Metric): number {
  return metric === "volume" ? 0 : 1;
}

/** Points for the line chart. Sessions with no value for the metric are left out. */
export function seriesToLine(series: readonly SeriesPoint[], metric: Metric): { points: LinePoint[]; source: SeriesPoint[] } {
  const points: LinePoint[] = [];
  const source: SeriesPoint[] = [];
  for (const p of series) {
    const y = metricValue(p, metric);
    if (y === null) continue;
    points.push({ x: Date.parse(p.started_at), y, label: shortDate(p.date) });
    source.push(p);
  }
  return { points, source };
}

export function bestSetText(point: SeriesPoint, loadType: Exercise["load_type"], unit: Unit): string {
  const { reps, load } = point.best_set;
  const hasLoad = load !== null && load > 0;
  if (loadType === "external") return hasLoad ? `${num(load as number)} ${unit} x ${reps}` : `${reps} reps`;
  if (loadType === "bodyweight") return hasLoad ? `+${num(load as number)} ${unit} x ${reps}` : `${reps} reps`;
  return hasLoad ? `${reps} reps with ${num(load as number)} ${unit} assistance` : `${reps} reps`;
}

export function sessionFacts(point: SeriesPoint, loadType: Exercise["load_type"], unit: Unit): string[] {
  const facts = [`Best set: ${bestSetText(point, loadType, unit)}`];
  facts.push(`${point.work_sets} work ${point.work_sets === 1 ? "set" : "sets"}, ${point.total_reps} reps in total`);
  if (point.avg_rir !== null) facts.push(`Average ${num(point.avg_rir)} reps in reserve`);
  if (point.pain) facts.push("Pain was flagged in this session");
  return facts;
}

/** "Up 15 lb since Oct 1" for a series of at least two points; null otherwise. */
export function trendSummary(points: readonly LinePoint[], unit: string, digits = 1): string | null {
  if (points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const delta = Number((last.y - first.y).toFixed(digits));
  const amount = `${num(Math.abs(delta), digits)} ${unit}`;
  const sessions = `${points.length} sessions`;
  if (delta === 0) return `No change since ${first.label} (${sessions})`;
  return `${delta > 0 ? "Up" : "Down"} ${amount} since ${first.label} (${sessions})`;
}

export interface VolumeRows {
  rows: BandRow[];
  /** Muscles with no hard sets in the week, as display names. */
  untrained: string[];
  total: number;
}

export function volumeRows(volumes: readonly MuscleVolume[]): VolumeRows {
  const trained = volumes.filter((v) => v.sets > 0).sort((a, b) => b.sets - a.sets || a.muscle.localeCompare(b.muscle));
  return {
    rows: trained.map((v) => ({
      key: v.muscle,
      label: sentence(v.muscle),
      value: v.sets,
      detail: `${v.direct_sets} direct ${v.direct_sets === 1 ? "set" : "sets"}, ${v.indirect_sets} indirect`,
    })),
    untrained: volumes.filter((v) => v.sets === 0).map((v) => sentence(v.muscle)),
    total: volumes.reduce((n, v) => n + v.direct_sets, 0),
  };
}

/** What an engine decision changed, as before and after rows. Empty for a hold. */
export function decisionChangeRows(item: DecisionItem, ctx: DiffContext): DiffRow[] {
  const rows: DiffRow[] = [];
  if (item.from_exercise) rows.push({ label: "Exercise", before: item.from_exercise, after: item.exercise });
  const changed = prescriptionRows(
    ctx,
    item.before,
    { sets: item.after.sets, rep_min: item.after.rep_min, rep_max: item.after.rep_max, target_rir: item.after.target_rir, load: item.after.load },
    item.after.exercise_id,
  );
  // After a variation change the old load belongs to a different exercise, so only the new one is shown.
  for (const r of changed) rows.push(item.from_exercise && r.label === "Load" ? { ...r, before: null } : r);
  return rows;
}
