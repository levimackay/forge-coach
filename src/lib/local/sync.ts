import type { Table } from "dexie";
import { READ_ONLY_SYNCED_TABLES, SYNCED_TABLES, type SyncedTable } from "@/lib/domain/types";
import { getSupabase } from "@/lib/supabase/client";
import { clearLocalData, getDb, getMeta, pkOf, setMeta, type LocalTable, type OutboxEntry } from "./db";
import { devFixtureActive, getActiveUserId } from "./session";

/** Parents before children so foreign keys are satisfied on the server. */
const PUSH_ORDER: SyncedTable[] = [
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
];

// audit_log is pulled first, on its own, by adoptRemoteWipe.
const PULL_TABLES: LocalTable[] = [...SYNCED_TABLES, ...READ_ONLY_SYNCED_TABLES].filter((t) => t !== "audit_log");
const WIPE_SEEN_KEY = "wipe_seen_at";

const PUSH_CHUNK = 200;
const PULL_PAGE = 500;
// A transaction that committed late can carry a server_updated_at older than a
// cursor we already advanced past. Re-reading a short window makes that harmless
// because applying a pulled row twice changes nothing.
const PULL_OVERLAP_MS = 10_000;
const MAX_ROW_ATTEMPTS = 5;
const WRITE_FLUSH_DELAY_MS = 150;
const FOREGROUND_POLL_MS = 60_000;
const BACKOFF_BASE_MS = 2_000;
const BACKOFF_MAX_MS = 5 * 60_000;

export interface SyncState {
  syncing: boolean;
  online: boolean;
  lastSyncedAt: string | null;
  error: string | null;
  /** True once a full pull has completed for this device and account. */
  hydrated: boolean;
}

const INITIAL_STATE: SyncState = {
  syncing: false,
  online: true,
  lastSyncedAt: null,
  error: null,
  hydrated: false,
};

let state: SyncState = INITIAL_STATE;
const listeners = new Set<() => void>();

function setState(patch: Partial<SyncState>): void {
  const next = { ...state, ...patch };
  if ((Object.keys(next) as (keyof SyncState)[]).every((k) => next[k] === state[k])) return;
  state = next;
  for (const l of listeners) l();
}

export function subscribeSyncState(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSyncState(): SyncState {
  return state;
}

export function getServerSyncState(): SyncState {
  return INITIAL_STATE;
}

let autoFlush = true;
export function configureSync(options: { autoFlush: boolean }): void {
  autoFlush = options.autoFlush;
}

/** Test hook: back to a pristine in-memory sync state. */
export function resetSyncForTests(): void {
  state = INITIAL_STATE;
  paused = 0;
  failures = 0;
  nextAttemptAt = 0;
  running = null;
  rerun = false;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

export function backoffDelayMs(failureCount: number, random: number = Math.random()): number {
  const exp = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, failureCount - 1));
  return Math.round(exp * (0.5 + random / 2));
}

type FailureKind = "transient" | "data";

interface PgLikeError {
  message: string;
  code?: string;
}

interface PgLikeResponse {
  error: PgLikeError | null;
  status: number;
}

class SyncError extends Error {
  constructor(
    message: string,
    readonly kind: FailureKind,
  ) {
    super(message);
  }
}

export function classify(res: PgLikeResponse): "ok" | FailureKind {
  if (!res.error) return "ok";
  const { status } = res;
  // 0 is how postgrest-js reports a fetch that never got a response.
  if (status === 0 || status === 401 || status === 408 || status === 429 || status >= 500) {
    return "transient";
  }
  return "data";
}

function friendly(res: PgLikeResponse): string {
  if (res.status === 0) return "No connection. Changes will sync when you are back online.";
  if (res.status === 401) return "Your session needs a refresh. Reopen the app while online.";
  return res.error?.message ?? "The server rejected a change.";
}

function toPayload(row: Record<string, unknown>): Record<string, unknown> {
  // server_updated_at is set by a trigger; clients must never send it.
  const { server_updated_at: _drop, ...rest } = row;
  void _drop;
  return rest;
}

async function upsert(table: SyncedTable, payload: Record<string, unknown>[]): Promise<PgLikeResponse> {
  try {
    const res = await getSupabase()
      .from(table)
      .upsert(payload, { onConflict: pkOf(table) });
    return { error: res.error, status: res.status };
  } catch (err) {
    return { error: { message: err instanceof Error ? err.message : "Request failed" }, status: 0 };
  }
}

function rawTable(table: LocalTable): Table<Record<string, unknown>, string> {
  return getDb().table(table) as Table<Record<string, unknown>, string>;
}

async function clearEntries(entries: OutboxEntry[]): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.outbox, async () => {
    for (const entry of entries) {
      const current = await db.outbox.get(entry.key);
      if (current && current.rev === entry.rev) await db.outbox.delete(entry.key);
    }
  });
}

async function recordRowFailure(entry: OutboxEntry, message: string): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.outbox, async () => {
    const current = await db.outbox.get(entry.key);
    if (!current || current.rev !== entry.rev) return;
    const attempts = current.attempts + 1;
    await db.outbox.put({
      ...current,
      attempts,
      last_error: message,
      parked: attempts >= MAX_ROW_ATTEMPTS ? 1 : 0,
    });
  });
}

async function pushChunk(table: SyncedTable, chunk: OutboxEntry[]): Promise<number> {
  const db = getDb();
  const raw = rawTable(table);
  const rows = await raw.bulkGet(chunk.map((e) => e.row_id));
  const live: { entry: OutboxEntry; row: Record<string, unknown> }[] = [];
  const orphans: string[] = [];
  chunk.forEach((entry, i) => {
    const row = rows[i];
    if (row) live.push({ entry, row });
    else orphans.push(entry.key);
  });
  if (orphans.length) await db.outbox.bulkDelete(orphans);
  if (live.length === 0) return 0;

  const res = await upsert(
    table,
    live.map((l) => toPayload(l.row)),
  );
  const kind = classify(res);
  if (kind === "ok") {
    await clearEntries(live.map((l) => l.entry));
    return 0;
  }
  if (kind === "transient") throw new SyncError(friendly(res), "transient");

  // One bad row must not block the rest, so find which rows the server rejects.
  let rejected = 0;
  for (const item of live) {
    const single = await upsert(table, [toPayload(item.row)]);
    const singleKind = classify(single);
    if (singleKind === "ok") await clearEntries([item.entry]);
    else if (singleKind === "transient") throw new SyncError(friendly(single), "transient");
    else {
      rejected += 1;
      await recordRowFailure(item.entry, friendly(single));
    }
  }
  return rejected;
}

/** Pushes every pending local write. Returns how many rows the server rejected. */
export async function flushOutbox(): Promise<number> {
  const db = getDb();
  let rejected = 0;
  for (const table of PUSH_ORDER) {
    const entries = await db.outbox
      .where("table")
      .equals(table)
      .filter((e) => e.parked === 0)
      .toArray();
    for (let i = 0; i < entries.length; i += PUSH_CHUNK) {
      rejected += await pushChunk(table, entries.slice(i, i + PUSH_CHUNK));
    }
  }
  return rejected;
}

function isReadOnly(table: LocalTable): table is "coach_proposals" | "audit_log" {
  return table === "coach_proposals" || table === "audit_log";
}

/** Postgres returns "+00:00" with microseconds; store the same ISO shape the client writes. */
function normalizeRemote(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const [key, value] of Object.entries(row)) {
    if (key === "server_updated_at" || typeof value !== "string") continue;
    if (key === "at" || key.endsWith("_at")) {
      const ms = Date.parse(value);
      if (!Number.isNaN(ms)) out[key] = new Date(ms).toISOString();
    }
  }
  return out;
}

export async function applyPulled(
  table: LocalTable,
  remoteRows: Record<string, unknown>[],
): Promise<void> {
  if (remoteRows.length === 0) return;
  const db = getDb();
  const raw = rawTable(table);
  const pk = pkOf(table);
  const readOnly = isReadOnly(table);

  await db.transaction("rw", raw, db.outbox, async () => {
    const ids = remoteRows.map((r) => r[pk] as string);
    const existing = await raw.bulkGet(ids);
    const pending = readOnly ? [] : await db.outbox.bulkGet(ids.map((id) => `${table}:${id}`));
    const toPut: Record<string, unknown>[] = [];
    const toClear: string[] = [];

    remoteRows.forEach((remote, i) => {
      const incoming = normalizeRemote(remote);
      const local = existing[i];
      if (!local || readOnly) {
        toPut.push(incoming);
        return;
      }
      const remoteMs = Date.parse(incoming.updated_at as string);
      const localMs = Date.parse(local.updated_at as string);
      const entry = pending[i];
      if (entry) {
        // Unsynced local edit: it only loses to a strictly newer remote edit.
        if (remoteMs > localMs) {
          toPut.push(incoming);
          toClear.push(entry.key);
        }
        return;
      }
      if (Number.isNaN(localMs) || remoteMs >= localMs) toPut.push(incoming);
    });

    if (toPut.length) await raw.bulkPut(toPut);
    if (toClear.length) await db.outbox.bulkDelete(toClear);
  });
}

export function cursorColumn(table: LocalTable): string {
  return table === "audit_log" ? "at" : "server_updated_at";
}

async function pullTable(table: LocalTable): Promise<void> {
  const supabase = getSupabase();
  const col = cursorColumn(table);
  const pk = pkOf(table);
  const cursor = await getMeta<string>(`cursor:${table}`);
  const since = cursor ? new Date(Date.parse(cursor) - PULL_OVERLAP_MS).toISOString() : null;

  let afterAt: string | null = null;
  let afterPk: string | null = null;
  let newest: string | null = cursor ?? null;

  for (;;) {
    let query = supabase.from(table).select("*");
    if (afterAt === null) {
      if (since) query = query.gte(col, since);
    } else {
      query = query.or(`${col}.gt.${afterAt},and(${col}.eq.${afterAt},${pk}.gt.${afterPk})`);
    }
    const res = await query
      .order(col, { ascending: true })
      .order(pk, { ascending: true })
      .limit(PULL_PAGE);
    if (res.error) {
      const kind = classify({ error: res.error, status: res.status });
      throw new SyncError(friendly({ error: res.error, status: res.status }), kind === "data" ? "data" : "transient");
    }
    const rows = (res.data ?? []) as Record<string, unknown>[];
    if (rows.length === 0) break;
    await applyPulled(table, rows);
    const last = rows[rows.length - 1];
    afterAt = last[col] as string;
    afterPk = last[pk] as string;
    newest = afterAt;
    if (rows.length < PULL_PAGE) break;
  }

  if (newest && newest !== cursor) await setMeta(`cursor:${table}`, newest);
}

async function newestWipe(): Promise<string | null> {
  const entry = await getDb()
    .audit_log.orderBy("at")
    .reverse()
    .filter((e) => e.action === "delete_my_data")
    .first();
  return entry?.at ?? null;
}

/**
 * "Delete all my data" removes the rows on the server, which a pull cannot show another device, but
 * it leaves an audit entry. When this device sees one newer than any it saw before, it clears itself
 * too and returns true, and its queued writes are dropped instead of re-creating rows in the emptied
 * account. On a device's first pull the newest wipe is only recorded: what it holds came after it.
 */
async function adoptRemoteWipe(): Promise<boolean> {
  const firstPull = (await getMeta<boolean>("hydrated")) !== true;
  const seen = (await getMeta<string>(WIPE_SEEN_KEY)) ?? (await newestWipe());
  await pullTable("audit_log");
  const newest = await newestWipe();
  if (newest === null || (seen !== null && Date.parse(newest) <= Date.parse(seen))) return false;
  if (!firstPull) {
    await clearLocalData({ keepOwner: true });
    setState({ hydrated: false });
    await pullTable("audit_log");
  }
  await setMeta(WIPE_SEEN_KEY, newest);
  return !firstPull;
}

export async function pullAll(): Promise<void> {
  const results = await Promise.allSettled(PULL_TABLES.map((t) => pullTable(t)));
  const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failed) throw failed.reason;
}

let running: Promise<void> | null = null;
let rerun = false;
let paused = 0;

/**
 * Runs `fn` with sync stopped: a pass already running finishes first and no new one starts until
 * `fn` settles, so nothing a pass pulls can land after `fn` cleared the device.
 */
export async function withSyncPaused<T>(fn: () => Promise<T>): Promise<T> {
  paused += 1;
  try {
    while (running) await running;
    return await fn();
  } finally {
    paused -= 1;
  }
}
let failures = 0;
let nextAttemptAt = 0;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function canSync(): boolean {
  if (typeof window === "undefined") return false;
  if (devFixtureActive()) return false;
  if (!getActiveUserId()) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  return true;
}

function scheduleRetry(delayMs: number): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void requestSync(false);
  }, delayMs);
}

function requestSync(force: boolean): Promise<void> {
  if (!canSync() || paused > 0) return Promise.resolve();
  if (!force && Date.now() < nextAttemptAt) return Promise.resolve();
  if (running) {
    rerun = true;
    return running;
  }

  running = (async () => {
    setState({ syncing: true });
    try {
      let rejected = 0;
      do {
        rerun = false;
        // Refreshes the access token first when it is about to expire.
        try {
          await getSupabase().auth.getSession();
        } catch {
          // a failed refresh surfaces as a 401 on the requests below
        }
        // A wipe from another device comes first: pushing this device's queue would re-create rows.
        const wiped = await adoptRemoteWipe();
        rejected = wiped ? 0 : await flushOutbox();
        await pullAll();
      } while (rerun);

      // The pull finished, so this device has the account's data whatever happened to pushes.
      await setMeta("hydrated", true);
      setState({ hydrated: true });

      if (rejected > 0) {
        failures += 1;
        const delay = backoffDelayMs(failures);
        nextAttemptAt = Date.now() + delay;
        scheduleRetry(delay);
        setState({ error: "Some changes were rejected by the server." });
        return;
      }
      failures = 0;
      nextAttemptAt = 0;
      const at = new Date().toISOString();
      await setMeta("last_synced_at", at);
      setState({ error: null, lastSyncedAt: at });
    } catch (err) {
      failures += 1;
      const delay = backoffDelayMs(failures);
      nextAttemptAt = Date.now() + delay;
      scheduleRetry(delay);
      setState({ error: err instanceof Error ? err.message : "Sync failed." });
    } finally {
      running = null;
      setState({ syncing: false });
    }
  })();
  return running;
}

/** Push then pull now. Never rejects; failures land in the sync state. */
export function syncNow(): Promise<void> {
  return requestSync(true);
}

/** Called after every local write. Respects the backoff window. */
export function scheduleFlush(): void {
  if (!autoFlush || typeof window === "undefined") return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void requestSync(false);
  }, WRITE_FLUSH_DELAY_MS);
}

async function loadPersistedState(): Promise<void> {
  const [lastSyncedAt, hydrated] = await Promise.all([
    getMeta<string>("last_synced_at"),
    getMeta<boolean>("hydrated"),
  ]);
  setState({ lastSyncedAt: lastSyncedAt ?? null, hydrated: hydrated === true });
}

/**
 * Wires the sync triggers for a signed-in session: launch, online,
 * visibility returning to visible, and a slow poll while the app is in front.
 * Returns the cleanup.
 */
export function startSync(): () => void {
  if (typeof window === "undefined") return () => {};
  failures = 0;
  nextAttemptAt = 0;
  setState({ online: navigator.onLine });
  void loadPersistedState();

  const onOnline = () => {
    setState({ online: true });
    void requestSync(true);
  };
  const onOffline = () => setState({ online: false });
  const onVisible = () => {
    if (document.visibilityState === "visible") void requestSync(true);
  };
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onVisible);
  const poll = setInterval(() => {
    if (document.visibilityState === "visible") void requestSync(false);
  }, FOREGROUND_POLL_MS);

  void requestSync(true);

  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    document.removeEventListener("visibilitychange", onVisible);
    clearInterval(poll);
    if (flushTimer) clearTimeout(flushTimer);
    if (retryTimer) clearTimeout(retryTimer);
    flushTimer = null;
    retryTimer = null;
  };
}
