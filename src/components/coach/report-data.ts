import type { Report, ReportData, ReportKind } from "@/lib/reports";
import { buildReport } from "@/lib/reports";
import type { Unit } from "@/lib/domain/types";
import { loadActiveProgram, loadExerciseLibrary, loadProfile } from "@/lib/local/hooks";
import { getDb } from "@/lib/local/db";

const alive = <T extends { deleted_at?: string | null }>(row: T): boolean => !row.deleted_at;

/** The whole local history in the shape reports read. Reports look back past their period, so nothing is trimmed. */
export async function loadReportData(): Promise<ReportData> {
  const db = getDb();
  const [profile, active, exercises, goals, equipment, workouts, sets, recovery, measurements, decisions] = await Promise.all([
    loadProfile(),
    loadActiveProgram(),
    loadExerciseLibrary(),
    db.goals.filter(alive).toArray(),
    db.equipment_profiles.filter(alive).toArray(),
    db.workouts.filter(alive).toArray(),
    db.workout_sets.filter(alive).toArray(),
    db.recovery_logs.filter(alive).toArray(),
    db.body_measurements.filter(alive).toArray(),
    db.progression_decisions.filter(alive).toArray(),
  ]);
  return {
    profile,
    goals,
    equipment_profiles: equipment,
    program: active?.program ?? null,
    program_days: active?.days ?? [],
    planned_exercises: active?.planned ?? [],
    exercises,
    workouts,
    workout_sets: sets,
    recovery_logs: recovery,
    body_measurements: measurements,
    progression_decisions: decisions,
  };
}

export async function generateReport(kind: ReportKind, unit: Unit, now: Date = new Date()): Promise<Report> {
  const data = await loadReportData();
  return buildReport({ kind, data, now: now.toISOString(), unit });
}
