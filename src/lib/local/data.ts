import type { Table } from "dexie";
import {
  EXPORT_FORMAT_VERSION,
  READ_ONLY_SYNCED_TABLES,
  SYNCED_TABLES,
  type ForgeExport,
  type SyncedTable,
  type TableRowMap,
} from "@/lib/domain/types";
import { clearLocalData, getDb, getMeta, setMeta, type LocalTable } from "./db";
import { recoveryLogId } from "./ids";
import { callRpc } from "./proposals";
import { withSyncPaused } from "./sync";
import { forgeExportSchema } from "./schema";
import { requireUserId } from "./session";
import { putRows, type RowInput } from "./write";

const ALL_TABLES: LocalTable[] = [...SYNCED_TABLES, ...READ_ONLY_SYNCED_TABLES];

function rawTable(table: LocalTable): Table<Record<string, unknown>, string> {
  return getDb().table(table) as Table<Record<string, unknown>, string>;
}

export { clearLocalData };

/** The device still holds another account's changes that never reached the server. */
export class UnsyncedChangesError extends Error {
  constructor(readonly count: number) {
    super(
      `This device has ${count} ${count === 1 ? "change" : "changes"} from another account that ${count === 1 ? "has" : "have"} not synced. ` +
        "Sign in to that account while online to sync them, or discard them to sign in here.",
    );
    this.name = "UnsyncedChangesError";
  }
}

/**
 * The local database holds exactly one account. When a different account signs
 * in on this device, the previous account's cache is dropped so rows never mix.
 * Unsynced changes of the previous account are never dropped silently: that
 * needs `discardUnsynced`, which the person has to choose.
 */
export async function bindLocalDataToUser(userId: string, options: { discardUnsynced?: boolean } = {}): Promise<void> {
  const owner = await getMeta<string>("owner");
  if (owner === userId) return;
  if (owner !== undefined) {
    const pending = await getDb().outbox.count();
    if (pending > 0 && !options.discardUnsynced) throw new UnsyncedChangesError(pending);
    await clearLocalData();
  }
  await setMeta("owner", userId);
}

/**
 * Everything needed to rebuild this account, readable offline. Soft-deleted rows are kept (with
 * deleted_at) because live rows still point at them, such as a workout at a deleted equipment
 * profile or a decision of a deleted workout; without them a restore fails on foreign keys.
 */
export async function exportAll(now: Date = new Date()): Promise<ForgeExport> {
  const userId = requireUserId();
  const tables: ForgeExport["tables"] = {};
  const out = tables as Record<string, unknown[]>;
  for (const name of ALL_TABLES) {
    const rows = await rawTable(name).toArray();
    out[name] = rows
      .filter((r) => name !== "exercises" || r.user_id !== null)
      .map((r) => {
        const { server_updated_at: _drop, ...rest } = r;
        void _drop;
        return rest;
      });
  }
  return {
    format: "forge-coach-export",
    version: EXPORT_FORMAT_VERSION,
    exported_at: now.toISOString(),
    user_id: userId,
    tables,
  };
}

export interface ImportResult {
  imported: Partial<Record<SyncedTable, number>>;
  /** Rows in tables the server owns (proposals, audit log) or global library rows. */
  skipped: number;
}

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

type Row = Record<string, unknown>;

/** Every string equal to a key of `ids` is replaced: row ids, foreign keys and ids inside JSON columns. */
function remapIds(value: unknown, ids: Map<string, string>): unknown {
  if (typeof value === "string") return ids.get(value) ?? value;
  if (Array.isArray(value)) return value.map((v) => remapIds(v, ids));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, remapIds(v, ids)]));
  }
  return value;
}

/**
 * Ids are global primary keys, so rows copied from another account need new ones: with the
 * originals the server would treat them as that account's rows and refuse every one. Library
 * exercises keep their ids; only rows the file's account owns are renamed.
 */
function freshIds(tables: ForgeExport["tables"], userId: string): Map<string, string> {
  const ids = new Map<string, string>();
  for (const name of SYNCED_TABLES) {
    if (name === "profiles") continue;
    for (const row of (tables[name] ?? []) as unknown as Row[]) {
      if (name === "exercises" && row.user_id === null) continue;
      const dayLog = name === "recovery_logs" && !row.deleted_at;
      ids.set(row.id as string, dayLog ? recoveryLogId(userId, row.date as string) : crypto.randomUUID());
    }
  }
  return ids;
}

const time = (v: unknown): number => {
  const ms = Date.parse(String(v));
  return Number.isNaN(ms) ? 0 : ms;
};

/**
 * One active program per account (programs_one_active_per_user on the server). The file's newest
 * active program wins; any other active one, in the file or on this device, is switched off in
 * the same import so both rows reach the server in one request.
 */
async function oneActiveProgram(rows: Row[]): Promise<Row[]> {
  const active = rows.filter((r) => r.is_active && !r.deleted_at);
  if (active.length === 0) return rows;
  const keep = active.reduce((a, b) => (time(b.updated_at) > time(a.updated_at) ? b : a));
  const inFile = new Set(rows.map((r) => r.id));
  const others = await getDb()
    .programs.filter((p) => p.is_active && !p.deleted_at && !inFile.has(p.id))
    .toArray();
  if (others.length) await putRows("programs", others.map((p) => ({ ...p, is_active: false })));
  return rows.map((r) => (r !== keep && r.is_active ? { ...r, is_active: false } : r));
}

/**
 * One live check-in per day (recovery_logs_user_date_key on the server). A day this device already
 * has keeps its row id, so the import updates that check-in instead of adding a second one.
 */
async function onePerDay(rows: Row[]): Promise<Row[]> {
  const local = await getDb().recovery_logs.filter((r) => !r.deleted_at).toArray();
  const byDate = new Map(local.map((r) => [r.date, r.id]));
  return rows.map((r) => {
    const id = r.deleted_at ? undefined : byDate.get(r.date as string);
    return id && id !== r.id ? { ...r, id } : r;
  });
}

/** Validates an export file and upserts its rows by id into this account. */
export async function importExport(json: unknown): Promise<ImportResult> {
  const parsed = forgeExportSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue.path.length ? ` at ${issue.path.join(".")}` : "";
    throw new ImportError(`This file is not a valid FORGE export${where}: ${issue.message}`);
  }
  const { tables } = parsed.data;
  const result: ImportResult = { imported: {}, skipped: 0 };
  const userId = requireUserId();
  const db = getDb();
  const ids = parsed.data.user_id === userId ? null : freshIds(tables, userId);

  await db.transaction("rw", [...db.tables], async () => {
    for (const name of SYNCED_TABLES) {
      let rows = (tables[name] ?? []) as unknown as Row[];
      if (name === "exercises") {
        const custom = rows.filter((r) => r.user_id !== null);
        result.skipped += rows.length - custom.length;
        rows = custom;
      }
      if (rows.length === 0) continue;
      if (ids) rows = rows.map((r) => remapIds(r, ids) as Row);
      if (name === "profiles") rows = rows.map((r) => ({ ...r, user_id: userId }));
      if (name === "programs") rows = await oneActiveProgram(rows);
      if (name === "recovery_logs") rows = await onePerDay(rows);
      await putRows(name, rows as unknown as RowInput<TableRowMap[typeof name]>[]);
      result.imported[name] = rows.length;
    }
  });
  for (const name of READ_ONLY_SYNCED_TABLES) result.skipped += tables[name]?.length ?? 0;
  return result;
}

/**
 * Removes the account's data from the server, then from this device. Needs network. A sync pass
 * already running is finished first, so a pull that started before the wipe cannot write old rows
 * back afterwards. Other devices notice the wipe on their next sync (see sync.ts).
 */
export async function deleteAllMyData(): Promise<void> {
  await withSyncPaused(async () => {
    await callRpc("delete_my_data");
    await clearLocalData({ keepOwner: true });
  });
}
