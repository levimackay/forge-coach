"use client";

import type { IsoDate, IsoDateTime, Unit, Workout, WorkoutSet } from "@/lib/domain/types";
import { localDate as zonedDate } from "@/lib/analytics";
import { useNowIso } from "@/components/coach/use-now";
import { useLive, useProfile } from "@/lib/local";
import { getDb } from "@/lib/local/db";

export interface Athlete {
  unit: Unit;
  timeZone: string;
  today: IsoDate;
  nowIso: IsoDateTime;
  /** Bodyweight from the profile, used when no measurement is logged. */
  profileBodyweight: number | null;
}

/** `undefined` while loading, `null` when there is no profile yet. */
export function useAthlete(): Athlete | null | undefined {
  const profile = useProfile();
  const nowIso = useNowIso();
  if (profile === undefined) return undefined;
  if (profile === null) return null;
  return {
    unit: profile.unit,
    timeZone: profile.timezone,
    today: zonedDate(nowIso, profile.timezone),
    nowIso,
    profileBodyweight: profile.bodyweight,
  };
}

/** Every exercise that has a logged set, as [exercise_id, completed_at] index keys. Reads keys only, never rows. */
export async function loadTrainedKeys(): Promise<[string, string][]> {
  return (await getDb().workout_sets.orderBy("[exercise_id+completed_at]").keys()) as unknown as [string, string][];
}

export function useTrainedKeys(): [string, string][] | undefined {
  return useLive(loadTrainedKeys, []);
}

export interface TrainingWindow {
  workouts: Workout[];
  sets: WorkoutSet[];
}

/** Completed workouts from the last `days` days with their sets. Bounded so the page stays quick on a long history. */
export async function loadTrainingWindow(days: number, now: Date = new Date()): Promise<TrainingWindow> {
  const db = getDb();
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();
  const workouts = await db.workouts
    .where("started_at")
    .aboveOrEqual(since)
    .filter((w) => !w.deleted_at && w.status === "completed")
    .toArray();
  const sets = workouts.length
    ? await db.workout_sets
        .where("workout_id")
        .anyOf(workouts.map((w) => w.id))
        .filter((s) => !s.deleted_at)
        .toArray()
    : [];
  return { workouts, sets };
}

export function useTrainingWindow(days: number): TrainingWindow | undefined {
  return useLive(() => loadTrainingWindow(days), [days]);
}
