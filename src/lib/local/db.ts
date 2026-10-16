import Dexie, { type EntityTable } from "dexie";
import type {
  AuditEntry,
  BodyMeasurement,
  CoachProposal,
  EquipmentProfile,
  Exercise,
  Goal,
  PlannedExercise,
  ProgramDay,
  Program,
  ProgressionDecision,
  Profile,
  RecoveryLog,
  SyncedTable,
  Workout,
  WorkoutSet,
} from "@/lib/domain/types";

export const DB_NAME = "forge-coach";

export type ReadOnlyTable = "coach_proposals" | "audit_log";
export type LocalTable = SyncedTable | ReadOnlyTable;

export interface OutboxEntry {
  /** `${table}:${pk}`: one entry per row, so repeated edits coalesce. */
  key: string;
  table: SyncedTable;
  row_id: string;
  /** Bumps on every enqueue so a flush never clears a write made while it was in flight. */
  rev: number;
  queued_at: string;
  attempts: number;
  last_error: string | null;
  /** 1 once the server has rejected this row repeatedly; excluded from flushes. */
  parked: 0 | 1;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

/** Primary key column per table; everything is `id` except profiles. */
export function pkOf(table: LocalTable): "id" | "user_id" {
  return table === "profiles" ? "user_id" : "id";
}

export class ForgeDB extends Dexie {
  declare profiles: EntityTable<Profile, "user_id">;
  declare goals: EntityTable<Goal, "id">;
  declare equipment_profiles: EntityTable<EquipmentProfile, "id">;
  declare exercises: EntityTable<Exercise, "id">;
  declare programs: EntityTable<Program, "id">;
  declare program_days: EntityTable<ProgramDay, "id">;
  declare planned_exercises: EntityTable<PlannedExercise, "id">;
  declare workouts: EntityTable<Workout, "id">;
  declare workout_sets: EntityTable<WorkoutSet, "id">;
  declare recovery_logs: EntityTable<RecoveryLog, "id">;
  declare body_measurements: EntityTable<BodyMeasurement, "id">;
  declare progression_decisions: EntityTable<ProgressionDecision, "id">;
  declare coach_proposals: EntityTable<CoachProposal, "id">;
  declare audit_log: EntityTable<AuditEntry, "id">;
  declare outbox: EntityTable<OutboxEntry, "key">;
  declare meta: EntityTable<MetaEntry, "key">;

  constructor(name: string = DB_NAME) {
    super(name);
    this.version(1).stores({
      profiles: "user_id",
      goals: "id",
      equipment_profiles: "id",
      exercises: "id, slug, progression_group",
      programs: "id",
      program_days: "id, program_id",
      planned_exercises: "id, program_day_id, exercise_id",
      workouts: "id, status, started_at, program_day_id",
      workout_sets: "id, workout_id, planned_exercise_id, [exercise_id+completed_at]",
      recovery_logs: "id, date",
      body_measurements: "id, measured_on",
      progression_decisions: "id, planned_exercise_id, workout_id, decided_at",
      coach_proposals: "id, status, created_at",
      audit_log: "id, at",
      outbox: "key, table, parked",
      meta: "key",
    });
  }
}

let db: ForgeDB | null = null;

export function getDb(): ForgeDB {
  if (!db) db = new ForgeDB();
  return db;
}

/** Test hook: drop the cached instance so the next getDb() opens a fresh one. */
export function resetDbForTests(): void {
  db?.close();
  db = null;
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const row = await getDb().meta.get(key);
  return row?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await getDb().meta.put({ key, value });
}

/** Empties every local table, the outbox and the sync cursors. */
export async function clearLocalData(options: { keepOwner?: boolean } = {}): Promise<void> {
  const db = getDb();
  const owner = options.keepOwner ? await getMeta<string>("owner") : undefined;
  await db.transaction("rw", [...db.tables], async () => {
    for (const t of db.tables) await t.clear();
  });
  if (owner !== undefined) await setMeta("owner", owner);
}
