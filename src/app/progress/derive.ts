import type { Exercise, Unit } from "@/lib/domain/types";
import { E1RM_REP_CAP, type SeriesPoint } from "@/lib/analytics";
import type { LinePoint } from "@/components/charts";
import { plural, shortDate } from "@/lib/reports/format";

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

/** The one number a lift is judged by: the estimated max, or the most reps in a set. */
export type Measure = "e1rm" | "reps";

export const MEASURE_LABEL: Record<Measure, string> = { e1rm: "Estimated max", reps: "Most reps in a set" };

/**
 * The estimated max when there is one worth showing. It needs a weight that moves: a barbell or machine
 * load, or weight added to a bodyweight lift. Plain bodyweight work, bodyweight lifts with no bodyweight on
 * file, and lifts where most sessions go past the estimate's rep cap are told in reps instead.
 */
export function headlineMeasure(exercise: Pick<Exercise, "load_type">, series: readonly SeriesPoint[]): Measure {
  const hasEstimate = series.some((p) => p.top_e1rm !== null);
  const movesWeight = exercise.load_type === "external" || series.some((p) => p.top_load !== null && p.top_load > 0);
  const highRep = series.filter((p) => p.max_reps > E1RM_REP_CAP).length * 2 > series.length;
  return hasEstimate && movesWeight && !highRep ? "e1rm" : "reps";
}

/** One point per finished workout. Workouts with no value for the measure are left out. */
export function seriesToLine(series: readonly SeriesPoint[], measure: Measure): LinePoint[] {
  return series.flatMap((p) => {
    const y = measure === "e1rm" ? p.top_e1rm : p.max_reps;
    return y === null ? [] : [{ x: Date.parse(p.started_at), y, label: shortDate(p.date) }];
  });
}

/** The screen shows whole numbers, and the change since the first point is worked out from those same numbers. */
export const shown = (y: number): string => Math.round(y).toLocaleString("en-US");

/** "Up 6 lb since Sep 11". Null for fewer than two points. */
export function sinceText(points: readonly LinePoint[], measure: Measure, unit: Unit): string | null {
  if (points.length < 2) return null;
  const first = points[0];
  const delta = Math.round(points[points.length - 1].y) - Math.round(first.y);
  if (delta === 0) return `No change since ${first.label}`;
  const size = Math.abs(delta);
  return `${delta > 0 ? "Up" : "Down"} ${measure === "reps" ? plural(size, "rep") : `${size.toLocaleString("en-US")} ${unit}`} since ${first.label}`;
}
