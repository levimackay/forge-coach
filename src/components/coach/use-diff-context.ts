"use client";

import { useMemo } from "react";
import type { EquipmentProfile, Exercise, PlannedExercise, Program, ProgramDay, Unit, Uuid } from "@/lib/domain/types";
import { useEquipmentProfiles, useExerciseLibrary, useLive, useProfile } from "@/lib/local";
import { getDb } from "@/lib/local/db";
import type { DiffContext } from "./diff";

export interface CoachContext {
  diff: DiffContext;
  programs: ReadonlyMap<Uuid, Program>;
}

export interface ProgramRows {
  planned: PlannedExercise[];
  days: ProgramDay[];
  programs: Program[];
}

/**
 * Removed exercises, retired days and replaced programs are included on purpose: a history entry about a
 * removal still has to say which exercise it was.
 */
export async function loadProgramRows(): Promise<ProgramRows> {
  const db = getDb();
  const [planned, days, programs] = await Promise.all([db.planned_exercises.toArray(), db.program_days.toArray(), db.programs.toArray()]);
  return { planned, days, programs };
}

export function buildCoachContext(unit: Unit, library: Exercise[], equipment: EquipmentProfile[], rows: ProgramRows): CoachContext {
  return {
    diff: {
      planned: new Map(rows.planned.map((p) => [p.id, p])),
      days: new Map(rows.days.map((d) => [d.id, d])),
      exercises: new Map(library.map((e) => [e.id, e])),
      equipment: new Map(equipment.map((e) => [e.id, e])),
      unit,
    },
    programs: new Map(rows.programs.map((p) => [p.id, p])),
  };
}

/** Everything a proposal diff needs to name things. */
export function useCoachContext(): CoachContext | undefined {
  const profile = useProfile();
  const library = useExerciseLibrary();
  const equipment = useEquipmentProfiles();
  const rows = useLive(loadProgramRows, []);

  return useMemo(() => {
    if (!profile || !library || !equipment || !rows) return undefined;
    return buildCoachContext(profile.unit, library, equipment, rows);
  }, [profile, library, equipment, rows]);
}
