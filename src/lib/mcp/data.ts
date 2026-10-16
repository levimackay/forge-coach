import type { SupabaseClient } from "@supabase/supabase-js";
import { localDate, resolveBodyweight } from "@/lib/analytics";
import type {
  BodyMeasurement,
  Exercise,
  IsoDate,
  Profile,
  ProgramDay,
  Unit,
  Workout,
  WorkoutSet,
} from "@/lib/domain/types";
import { loadAll, loadOne, type QueryResult } from "./kit";

// PostgREST returns at most 1000 rows per request on Supabase, and long id lists must stay under URL limits.
const PAGE_SIZE = 1000;
const ID_CHUNK = 50;

const unique = (ids: readonly string[]) => [...new Set(ids)];

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface AthleteContext {
  profile: Profile | null;
  unit: Unit | null;
  timeZone: string;
  today: IsoDate;
  /** Latest measured bodyweight, else the profile's. Null when neither exists. */
  bodyweight: number | null;
  /** Newest first. */
  measurements: BodyMeasurement[];
}

export async function loadAthlete(db: SupabaseClient, now: Date): Promise<AthleteContext> {
  const [profile, measurements] = await Promise.all([
    loadOne<Profile>(db.from("profiles").select("*").maybeSingle(), "the profile"),
    loadAll<BodyMeasurement>(
      db.from("body_measurements").select("*").is("deleted_at", null).order("measured_on", { ascending: false }).limit(60),
      "body measurements",
    ),
  ]);
  const timeZone = profile?.timezone || "UTC";
  const today = localDate(now.toISOString(), timeZone);
  const bodyweight = resolveBodyweight({ profile, measurements, asOf: today })?.value ?? null;
  return { profile, unit: profile?.unit ?? null, timeZone, today, bodyweight, measurements };
}

export async function loadExercises(db: SupabaseClient, ids: readonly string[]): Promise<Exercise[]> {
  const parts = await Promise.all(
    chunks(unique(ids), ID_CHUNK).map((part) => loadAll<Exercise>(db.from("exercises").select("*").in("id", part), "exercises")),
  );
  return parts.flat();
}

export async function loadProgramDays(db: SupabaseClient, ids: readonly string[]): Promise<ProgramDay[]> {
  const parts = await Promise.all(
    chunks(unique(ids), ID_CHUNK).map((part) => loadAll<ProgramDay>(db.from("program_days").select("*").in("id", part), "program days")),
  );
  return parts.flat();
}

/** Run a ranged query until a short page comes back. The query must have a stable order. */
export async function pageAll<T>(
  what: string,
  build: (from: number, to: number) => PromiseLike<QueryResult<T[]>>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const page = await loadAll<T>(build(from, from + PAGE_SIZE - 1), what);
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export async function loadWorkouts(db: SupabaseClient, ids: readonly string[]): Promise<Workout[]> {
  const parts = await Promise.all(
    chunks(unique(ids), ID_CHUNK).map((part) =>
      loadAll<Workout>(db.from("workouts").select("*").in("id", part).is("deleted_at", null), "workouts"),
    ),
  );
  return parts.flat();
}

/** Every set of the given workouts. */
export async function loadSets(db: SupabaseClient, workoutIds: readonly string[]): Promise<WorkoutSet[]> {
  const parts = await Promise.all(
    chunks(unique(workoutIds), ID_CHUNK).map((part) =>
      pageAll<WorkoutSet>("sets", (from, to) =>
        db.from("workout_sets").select("*").in("workout_id", part).is("deleted_at", null).order("id").range(from, to),
      ),
    ),
  );
  return parts.flat();
}

/** ISO instant a day before `date` starts in UTC: a margin so a timezone offset never drops a workout at the edge. */
export function windowStartIso(date: IsoDate): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString();
}

/** Escape LIKE wildcards so athlete-typed text matches literally. */
export function likePattern(text: string): string {
  return `%${text.replace(/\*/g, "").replace(/[\\%_]/g, "\\$&")}%`;
}
