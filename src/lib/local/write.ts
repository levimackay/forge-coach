import type { Table } from "dexie";
import type { SyncedTable, TableRowMap } from "@/lib/domain/types";
import { getDb, pkOf, type OutboxEntry } from "./db";
import { requireUserId } from "./session";
import { scheduleFlush } from "./sync";

type SystemKey =
  | "id"
  | "user_id"
  | "created_at"
  | "updated_at"
  | "server_updated_at"
  | "deleted_at";

/** What callers pass to putRow: everything except bookkeeping, which is filled in. */
export type RowInput<T> = Omit<T, SystemKey> & Partial<Pick<T, Extract<SystemKey, keyof T>>>;

type Loose = Record<string, unknown>;

function rawTable(table: SyncedTable): Table<Loose, string> {
  return getDb().table(table) as Table<Loose, string>;
}

/**
 * Strictly newer than the stored version so last-write-wins on the server sees
 * every edit as an update, even two edits inside the same millisecond.
 */
export function nextUpdatedAt(previous: unknown): string {
  const prevMs = typeof previous === "string" ? Date.parse(previous) : Number.NaN;
  const floor = Number.isNaN(prevMs) ? Date.now() : prevMs + 1;
  return new Date(Math.max(Date.now(), floor)).toISOString();
}

export async function enqueue(table: SyncedTable, rowId: string): Promise<void> {
  const outbox = getDb().outbox;
  const key = `${table}:${rowId}`;
  const prev = await outbox.get(key);
  const entry: OutboxEntry = {
    key,
    table,
    row_id: rowId,
    rev: (prev?.rev ?? 0) + 1,
    queued_at: new Date().toISOString(),
    attempts: 0,
    last_error: null,
    parked: 0,
  };
  await outbox.put(entry);
}

export async function putRows<T extends SyncedTable>(
  table: T,
  inputs: RowInput<TableRowMap[T]>[],
): Promise<TableRowMap[T][]> {
  if (inputs.length === 0) return [];
  const userId = requireUserId();
  const db = getDb();
  const pk = pkOf(table);
  const raw = rawTable(table);

  const stored = await db.transaction("rw", raw, db.outbox, async () => {
    const out: Loose[] = [];
    for (const input of inputs as unknown as Loose[]) {
      const id = pk === "user_id" ? userId : ((input.id as string | undefined) ?? crypto.randomUUID());
      const existing = await raw.get(id);
      if (table === "exercises" && existing && existing.user_id === null) {
        throw new Error("Library exercises are read-only. Create a custom exercise instead.");
      }
      const nowIso = new Date().toISOString();
      const { server_updated_at: _ignored, ...rest } = input;
      void _ignored;
      const row: Loose = {
        ...rest,
        [pk]: id,
        user_id: userId,
        created_at: existing?.created_at ?? (input.created_at as string | undefined) ?? nowIso,
        updated_at: existing ? nextUpdatedAt(existing.updated_at) : nowIso,
      };
      if (pk === "id") row.deleted_at = (input.deleted_at as string | null | undefined) ?? null;
      if (existing?.server_updated_at) row.server_updated_at = existing.server_updated_at;
      await raw.put(row);
      await enqueue(table, id);
      out.push(row);
    }
    return out;
  });

  scheduleFlush();
  return stored as unknown as TableRowMap[T][];
}

export async function putRow<T extends SyncedTable>(
  table: T,
  input: RowInput<TableRowMap[T]>,
): Promise<TableRowMap[T]> {
  const [row] = await putRows(table, [input]);
  return row;
}

/** Soft delete: the row stays locally with deleted_at set so the delete can sync. */
export async function softDelete(
  table: Exclude<SyncedTable, "profiles">,
  id: string,
): Promise<void> {
  requireUserId();
  const db = getDb();
  const raw = rawTable(table);
  const changed = await db.transaction("rw", raw, db.outbox, async () => {
    const existing = await raw.get(id);
    if (!existing || existing.deleted_at) return false;
    const nowIso = new Date().toISOString();
    await raw.put({
      ...existing,
      deleted_at: nowIso,
      updated_at: nextUpdatedAt(existing.updated_at),
    });
    await enqueue(table, id);
    return true;
  });
  if (changed) scheduleFlush();
}
