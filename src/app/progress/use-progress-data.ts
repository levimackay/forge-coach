"use client";

import type { IsoDate, Unit } from "@/lib/domain/types";
import { localDate as zonedDate } from "@/lib/analytics";
import { useNowIso } from "@/components/coach/use-now";
import { useLive, useProfile } from "@/lib/local";
import { getDb } from "@/lib/local/db";

export interface Athlete {
  unit: Unit;
  timeZone: string;
  today: IsoDate;
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
