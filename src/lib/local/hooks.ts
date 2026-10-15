"use client";

import { useSyncExternalStore } from "react";
import Dexie from "dexie";
import { useLiveQuery } from "dexie-react-hooks";
import type {
  AuditEntry,
  BodyMeasurement,
  CoachProposal,
  EquipmentProfile,
  Exercise,
  PlannedExercise,
  Profile,
  Program,
  ProgramDay,
  ProgressionDecision,
  ProposalStatus,
  RecoveryLog,
  Workout,
  WorkoutSet,
  WorkoutStatus,
} from "@/lib/domain/types";
import { localDateDaysAgo } from "./dates";
import { getDb } from "./db";
import { getServerSyncState, getSyncState, subscribeSyncState } from "./sync";

const alive = <T extends { deleted_at?: string | null }>(row: T): boolean => !row.deleted_at;

/** Thin wrapper over useLiveQuery. `undefined` means the first read has not finished. */
export function useLive<T>(querier: () => Promise<T> | T, deps: unknown[] = []): T | undefined {
  return useLiveQuery(querier, deps);
}

export interface ActiveProgram {
  program: Program;
  days: ProgramDay[];
  /** Active planned exercises only, ordered by day position then slot position. */
  planned: PlannedExercise[];
}

export async function loadActiveProgram(): Promise<ActiveProgram | null> {
  const db = getDb();
  const candidates = await db.programs.filter((p) => p.is_active && alive(p)).toArray();
  if (candidates.length === 0) return null;
  const program = candidates.sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  const days = (await db.program_days.where("program_id").equals(program.id).filter(alive).toArray()).sort(
    (a, b) => a.position - b.position,
  );
  const dayPosition = new Map(days.map((d) => [d.id, d.position]));
  const planned = (
    await db.planned_exercises
      .where("program_day_id")
      .anyOf(days.map((d) => d.id))
      .filter((p) => p.is_active && alive(p))
      .toArray()
  ).sort(
    (a, b) =>
      (dayPosition.get(a.program_day_id) ?? 0) - (dayPosition.get(b.program_day_id) ?? 0) ||
      a.position - b.position,
  );
  return { program, days, planned };
}

export function useActiveProgram(): ActiveProgram | null | undefined {
  return useLiveQuery(loadActiveProgram, []);
}

export async function loadExerciseLibrary(): Promise<Exercise[]> {
  const rows = await getDb().exercises.filter(alive).toArray();
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export function useExerciseLibrary(): Exercise[] | undefined {
  return useLiveQuery(loadExerciseLibrary, []);
}

export async function loadWorkouts(opts: { limit?: number; status?: WorkoutStatus } = {}): Promise<Workout[]> {
  const { limit = 50, status } = opts;
  return getDb()
    .workouts.orderBy("started_at")
    .reverse()
    .filter((w) => alive(w) && (status === undefined || w.status === status))
    .limit(limit)
    .toArray();
}

export function useWorkouts(opts: { limit?: number; status?: WorkoutStatus } = {}): Workout[] | undefined {
  return useLiveQuery(() => loadWorkouts(opts), [opts.limit, opts.status]);
}

export async function loadWorkout(id: string | null | undefined): Promise<Workout | null> {
  if (!id) return null;
  const w = await getDb().workouts.get(id);
  return w && alive(w) ? w : null;
}

/** `undefined` while loading, `null` when there is no such workout. */
export function useWorkout(id: string | null | undefined): Workout | null | undefined {
  return useLiveQuery(() => loadWorkout(id), [id]);
}

export async function loadWorkoutSets(workoutId: string | null | undefined): Promise<WorkoutSet[]> {
  if (!workoutId) return [];
  const rows = await getDb().workout_sets.where("workout_id").equals(workoutId).filter(alive).toArray();
  return rows.sort((a, b) => a.completed_at.localeCompare(b.completed_at) || a.set_index - b.set_index);
}

export function useWorkoutSets(workoutId: string | null | undefined): WorkoutSet[] | undefined {
  return useLiveQuery(() => loadWorkoutSets(workoutId), [workoutId]);
}

export async function loadProfile(): Promise<Profile | null> {
  // The local database only ever holds one account, so there is at most one row.
  return (await getDb().profiles.toCollection().first()) ?? null;
}

/** `undefined` while loading, `null` when no profile row exists yet. */
export function useProfile(): Profile | null | undefined {
  return useLiveQuery(loadProfile, []);
}

export async function loadEquipmentProfiles(): Promise<EquipmentProfile[]> {
  const rows = await getDb().equipment_profiles.filter(alive).toArray();
  return rows.sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name));
}

export function useEquipmentProfiles(): EquipmentProfile[] | undefined {
  return useLiveQuery(loadEquipmentProfiles, []);
}

export async function loadRecoveryLogs(days: number, now: Date = new Date()): Promise<RecoveryLog[]> {
  const since = localDateDaysAgo(days, now);
  const rows = await getDb().recovery_logs.where("date").aboveOrEqual(since).filter(alive).toArray();
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

export function useRecoveryLogs(days: number): RecoveryLog[] | undefined {
  return useLiveQuery(() => loadRecoveryLogs(days), [days]);
}

export async function loadBodyMeasurements(): Promise<BodyMeasurement[]> {
  const rows = await getDb().body_measurements.filter(alive).toArray();
  return rows.sort((a, b) => b.measured_on.localeCompare(a.measured_on));
}

export function useBodyMeasurements(): BodyMeasurement[] | undefined {
  return useLiveQuery(loadBodyMeasurements, []);
}

export async function loadProposals(status?: ProposalStatus): Promise<CoachProposal[]> {
  const rows = await getDb()
    .coach_proposals.filter((p) => status === undefined || p.status === status)
    .toArray();
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function useProposals(status?: ProposalStatus): CoachProposal[] | undefined {
  return useLiveQuery(() => loadProposals(status), [status]);
}

export async function loadAuditLog(limit: number): Promise<AuditEntry[]> {
  return getDb().audit_log.orderBy("at").reverse().limit(limit).toArray();
}

export function useAuditLog(limit: number): AuditEntry[] | undefined {
  return useLiveQuery(() => loadAuditLog(limit), [limit]);
}

export async function loadProgressionDecisions(limit: number): Promise<ProgressionDecision[]> {
  return getDb().progression_decisions.orderBy("decided_at").reverse().filter(alive).limit(limit).toArray();
}

export function useProgressionDecisions(limit: number): ProgressionDecision[] | undefined {
  return useLiveQuery(() => loadProgressionDecisions(limit), [limit]);
}

/** Newest first. Includes warmups and in-progress sessions; callers filter. */
export async function loadSetsForExercise(exerciseId: string, limit: number): Promise<WorkoutSet[]> {
  return getDb()
    .workout_sets.where("[exercise_id+completed_at]")
    .between([exerciseId, Dexie.minKey], [exerciseId, Dexie.maxKey])
    .reverse()
    .filter(alive)
    .limit(limit)
    .toArray();
}

export function useSetsForExercise(exerciseId: string | null | undefined, limit: number): WorkoutSet[] | undefined {
  return useLiveQuery(() => (exerciseId ? loadSetsForExercise(exerciseId, limit) : []), [exerciseId, limit]);
}

export interface SyncStatus {
  /** Local writes not yet accepted by the server. */
  pending: number;
  /** Writes the server rejected repeatedly; they stay on this device. */
  failed: number;
  lastSyncedAt: string | null;
  online: boolean;
  syncing: boolean;
  error: string | null;
  /** True once the first full pull finished, so an empty profile really means "new account". */
  hydrated: boolean;
}

const NO_COUNTS = { pending: 0, failed: 0 };

export function useSyncStatus(): SyncStatus {
  const s = useSyncExternalStore(subscribeSyncState, getSyncState, getServerSyncState);
  const counts = useLiveQuery(
    async () => {
      const outbox = getDb().outbox;
      const [pending, failed] = await Promise.all([
        outbox.where("parked").equals(0).count(),
        outbox.where("parked").equals(1).count(),
      ]);
      return { pending, failed };
    },
    [],
    NO_COUNTS,
  );
  return { ...counts, ...s };
}
