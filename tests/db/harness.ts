import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = path.resolve(here, "../../supabase/migrations");

export function migrationFiles(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{14}_[a-z0-9_]+\.sql$/.test(f))
    .sort();
}

/** In-memory Postgres with the Supabase shim and every real migration applied in order. */
export async function createDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(fs.readFileSync(path.join(here, "shim.sql"), "utf8"));
  for (const file of migrationFiles()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
  }
  return db;
}

export const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const OAUTH_CLIENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

export interface Claims {
  sub: string;
  role: string;
  client_id?: string;
  [key: string]: unknown;
}

export const firstParty = (sub: string): Claims => ({ sub, role: "authenticated", aud: "authenticated" });
export const oauthClient = (sub: string): Claims => ({ ...firstParty(sub), client_id: OAUTH_CLIENT });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export interface DbError {
  code: string;
  message: string;
}

export interface Session {
  rows(sql: string, params?: unknown[]): Promise<Row[]>;
  /** Runs a statement and returns the number of rows it changed. */
  exec(sql: string, params?: unknown[]): Promise<number>;
  /** Runs a statement that must fail. The failure is contained in a savepoint. */
  denied(sql: string, params?: unknown[]): Promise<DbError>;
  /** Runs a statement that must return exactly one row. */
  one(sql: string, params?: unknown[]): Promise<Row>;
  /** Changes role and claims mid-transaction (superuser to API user and back). */
  switch(role: "authenticated" | "anon" | "postgres", claims?: Claims | null): Promise<void>;
}

function session(db: PGlite): Session {
  let n = 0;
  return {
    async rows(sql, params) {
      return (await db.query<Row>(sql, params)).rows;
    },
    async exec(sql, params) {
      return (await db.query(sql, params)).affectedRows ?? 0;
    },
    async denied(sql, params) {
      const sp = `sp_${n++}`;
      await db.exec(`savepoint ${sp}`);
      try {
        await db.query(sql, params);
      } catch (e) {
        await db.exec(`rollback to savepoint ${sp}`);
        await db.exec(`release savepoint ${sp}`);
        const err = e as { code?: string; message?: string };
        return { code: err.code ?? "", message: err.message ?? String(e) };
      }
      await db.exec(`rollback to savepoint ${sp}`);
      throw new Error(`statement was expected to fail but succeeded: ${sql}`);
    },
    async one(sql, params) {
      const rows = (await db.query<Row>(sql, params)).rows;
      if (rows.length !== 1) throw new Error(`expected exactly one row, got ${rows.length}: ${sql}`);
      return rows[0];
    },
    async switch(role, claims) {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claims', $1, true)", [claims ? JSON.stringify(claims) : ""]);
      if (role !== "postgres") await db.exec(`set local role ${role}`);
    },
  };
}

/**
 * Runs fn in a transaction that is always rolled back, as the given API role
 * with the given JWT claims. Pass role "postgres" to stay the superuser while
 * still setting claims (used to prepare state).
 */
export async function withRole<T>(
  db: PGlite,
  role: "authenticated" | "anon" | "postgres",
  claims: Claims | null,
  fn: (s: Session) => Promise<T>,
): Promise<T> {
  await db.exec("begin");
  try {
    if (claims) await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    if (role !== "postgres") await db.exec(`set local role ${role}`);
    return await fn(session(db));
  } finally {
    await db.exec("rollback");
  }
}

export const asUser = <T>(db: PGlite, claims: Claims, fn: (s: Session) => Promise<T>) =>
  withRole(db, "authenticated", claims, fn);

export const asAnon = <T>(db: PGlite, fn: (s: Session) => Promise<T>) => withRole(db, "anon", null, fn);

/** Superuser session with no claims. Bypasses RLS: use only to prepare or inspect state. */
export const asAdmin = <T>(db: PGlite, fn: (s: Session) => Promise<T>) => withRole(db, "postgres", null, fn);

export const SYNCED_TABLES = [
  "profiles",
  "goals",
  "equipment_profiles",
  "exercises",
  "programs",
  "program_days",
  "planned_exercises",
  "workouts",
  "workout_sets",
  "recovery_logs",
  "body_measurements",
  "progression_decisions",
] as const;

export const ALL_TABLES = [...SYNCED_TABLES, "coach_proposals", "audit_log"] as const;
export type TableName = (typeof ALL_TABLES)[number];

/** Tables a first-party client may write (everything except proposals and the audit log). */
export const CLIENT_WRITABLE = SYNCED_TABLES;
